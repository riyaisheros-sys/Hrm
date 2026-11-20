-- Planning discipline: late entries (client ask, 20 Nov).
--
-- "If the planning entry is late this is a discipline factor" — flag it in
-- red in the reports and have the system KRA / KPI mention it.
--
-- A planning entry is LATE when it was first entered more than
-- late_entry_grace_minutes (default 30) after its slot had already ended.
-- Planning a slot before or during its window and updating it afterwards is
-- on time; only the first entry counts. Slots with no end time fall back to
-- the planning day's end.
--
-- Additive: one setting on planning_config, one read-only function, one more
-- allowed value for the KRA / KPI system logic, and the scorecard builder
-- learns to report late entries. Requires 20261120020000 (KRA / KPI).

alter table public.planning_config
  add column if not exists late_entry_grace_minutes integer not null default 30
    check (late_entry_grace_minutes >= 0);

-- Minutes after the slot's end at which the entry was made; 0 when on time.
-- Mirrored by planningLateMinutes() in src/features/planning/late.ts.
create or replace function public.late_minutes(ps public.planning_slots)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when d.delay > pc.late_entry_grace_minutes then d.delay else 0 end
    from public.planning_config pc
    cross join public.attendance_config ac
    cross join lateral (
      select floor(extract(epoch from (
               (ps.created_at at time zone ac.timezone)
               - (ps.plan_date + coalesce(ps.end_time, pc.day_end))
             )) / 60.0)::int as delay
    ) d
   where pc.id and ac.id;
$$;
grant execute on function public.late_minutes(public.planning_slots) to authenticated, service_role;

-- New system logic for KRA / KPI items: share of planning entries made on time.
alter table public.performance_items drop constraint if exists performance_items_system_metric_check;
alter table public.performance_items add constraint performance_items_system_metric_check
  check (
    system_metric in (
      'attendance', 'punctuality', 'task_completion', 'task_on_time', 'planning',
      'planning_discipline'
    )
  );

-- Scorecard builder: the Planning logic now also states how many entries were
-- late, and 'planning_discipline' scores on-time entries out of 10.
create or replace function public.init_appraisal_items(p_appraisal uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.appraisals;
  c public.appraisal_cycles;
  r record;
  v_days int; v_weight numeric;
  v_worked int; v_late int; v_compliant int;
  v_total int; v_done int; v_due int; v_ontime int;
  v_entries int; v_late_entries int; v_grace int;
  v_score numeric; v_note text; v_pct numeric;
  v_period text;
begin
  select * into a from public.appraisals where id = p_appraisal;
  if not found then raise exception 'appraisal not found'; end if;
  if coalesce(array_length(public.appraisal_scoring_roles(p_appraisal), 1), 0) = 0 then
    raise exception 'not allowed';
  end if;
  select * into c from public.appraisal_cycles where id = a.cycle_id;
  v_period := to_char(c.period_start, 'DD Mon YYYY') || ' – ' || to_char(c.period_end, 'DD Mon YYYY');

  if c.status = 'open' then
    insert into public.appraisal_item_scores
      (appraisal_id, item_id, kind, item_name, sort_order, system_metric)
    select p_appraisal, i.id, i.kind, i.name, i.sort_order, i.system_metric
      from public.user_performance_items u
      join public.performance_items i on i.id = u.item_id and i.is_active
     where u.user_id = a.user_id
    on conflict (appraisal_id, item_id) do nothing;

    -- Period facts, shared by every metric.
    select count(*),
           coalesce(sum(case status when 'full_day' then 1 when 'present' then 1
                                    when 'half_day' then 0.5 when 'quarter_day' then 0.25
                                    else 0 end), 0),
           count(*) filter (where status in ('full_day', 'present', 'half_day', 'quarter_day')),
           count(*) filter (where is_late)
      into v_days, v_weight, v_worked, v_late
      from public.attendance_days
     where user_id = a.user_id and work_date between c.period_start and c.period_end;
    select count(*) into v_compliant
      from public.planning_compliant_days(a.user_id, c.period_start, c.period_end + 1);
    -- Planning discipline: entries first made after their slot had ended.
    select count(*), count(*) filter (where public.late_minutes(ps) > 0)
      into v_entries, v_late_entries
      from public.planning_slots ps
     where ps.user_id = a.user_id and ps.kind = 'day'
       and ps.plan_date between c.period_start and c.period_end;
    select late_entry_grace_minutes into v_grace from public.planning_config where id;
    select count(*),
           count(*) filter (where s.is_terminal),
           count(*) filter (where s.is_terminal and t.due_date is not null and t.completed_at is not null),
           count(*) filter (where s.is_terminal and t.due_date is not null and t.completed_at is not null
                              and t.completed_at::date <= t.due_date)
      into v_total, v_done, v_due, v_ontime
      from public.tasks t join public.task_statuses s on s.id = t.status_id
     where t.assignee_id = a.user_id
       and t.created_at::date between c.period_start and c.period_end;

    for r in
      select id, system_metric from public.appraisal_item_scores
       where appraisal_id = p_appraisal and system_metric is not null
    loop
      v_score := null;
      case r.system_metric
        when 'attendance' then
          if v_days > 0 then
            v_pct := round(v_weight / v_days * 100, 1);
            v_score := round(v_pct / 10, 1);
            v_note := 'Attendance: ' || trim(to_char(v_weight, 'FM990.##')) || ' day-credits over '
              || v_days || ' recorded days = ' || v_pct || '% → ' || v_score
              || ' / 10. Full day = 1, half = 0.5, quarter = 0.25, absent = 0.';
          else
            v_note := 'No attendance recorded in this period — not scored.';
          end if;
        when 'punctuality' then
          if v_worked > 0 then
            v_pct := round((v_worked - v_late)::numeric / v_worked * 100, 1);
            v_score := round(v_pct / 10, 1);
            v_note := 'Punctuality: on time on ' || (v_worked - v_late) || ' of ' || v_worked
              || ' worked days (' || v_late || ' late) = ' || v_pct || '% → ' || v_score || ' / 10.';
          else
            v_note := 'No worked days in this period — not scored.';
          end if;
        when 'task_completion' then
          if v_total > 0 then
            v_pct := round(v_done::numeric / v_total * 100, 1);
            v_score := round(v_pct / 10, 1);
            v_note := 'Task completion: ' || v_done || ' of ' || v_total
              || ' tasks assigned in the period are completed = ' || v_pct || '% → ' || v_score || ' / 10.';
          else
            v_note := 'No tasks assigned in this period — not scored.';
          end if;
        when 'task_on_time' then
          if v_due > 0 then
            v_pct := round(v_ontime::numeric / v_due * 100, 1);
            v_score := round(v_pct / 10, 1);
            v_note := 'Tasks on time: ' || v_ontime || ' of ' || v_due
              || ' completed tasks with a due date were finished on or before it = '
              || v_pct || '% → ' || v_score || ' / 10.';
          else
            v_note := 'No completed tasks with a due date in this period — not scored.';
          end if;
        when 'planning' then
          if v_worked > 0 then
            v_pct := round(least(v_compliant, v_worked)::numeric / v_worked * 100, 1);
            v_score := round(v_pct / 10, 1);
            v_note := 'Planning: ' || least(v_compliant, v_worked) || ' of ' || v_worked
              || ' worked days were fully planned (or admin-unlocked) = ' || v_pct || '% → '
              || v_score || ' / 10.';
          else
            v_note := 'No worked days in this period — not scored.';
          end if;
          if v_entries > 0 then
            v_note := v_note || ' Discipline: ' || v_late_entries || ' of ' || v_entries
              || ' planning entries were made late (more than ' || v_grace
              || ' min after the slot ended).';
          end if;
        when 'planning_discipline' then
          if v_entries > 0 then
            v_pct := round((v_entries - v_late_entries)::numeric / v_entries * 100, 1);
            v_score := round(v_pct / 10, 1);
            v_note := 'Planning discipline: ' || (v_entries - v_late_entries) || ' of ' || v_entries
              || ' planning entries were made on time (' || v_late_entries
              || ' late — entered more than ' || v_grace || ' min after the slot ended) = '
              || v_pct || '% → ' || v_score || ' / 10.';
          else
            v_note := 'No planning entries in this period — not scored.';
          end if;
        else
          v_note := null;
      end case;
      update public.appraisal_item_scores
         set system_score = v_score,
             system_remarks = v_note || ' Period: ' || v_period || '.'
       where id = r.id;
    end loop;
  end if;

  return (select count(*)::int from public.appraisal_item_scores where appraisal_id = p_appraisal);
end;
$$;
grant execute on function public.init_appraisal_items(uuid) to authenticated;
