-- KRA / KPI architecture (client spec, 20 Nov):
--
--   Department → Designation → default KRAs and KPIs (picked from a master)
--   User → Designation → the designation's defaults, editable per user
--   Appraisal → every KRA / KPI scored out of 10 by four parties:
--     System (number + the logic used), Employee, Manager, HR
--     (number + remarks each)
--
-- Purely additive: five new tables, one nullable column on profiles, one
-- extra SELECT policy on appraisals, and three functions. The existing
-- appraisal scores (attendance / task / planning / overall) are untouched.

-- 1. Designations (per department) ------------------------------------------
create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, name)
);
drop trigger if exists trg_designations_updated on public.designations;
create trigger trg_designations_updated before update on public.designations
  for each row execute function public.set_updated_at();

alter table public.profiles
  add column if not exists designation_id uuid references public.designations(id) on delete set null;

-- 2. KRA / KPI master ---------------------------------------------------------
-- system_metric says which automatic logic scores the item; null = no system
-- score (people score it by hand only).
create table if not exists public.performance_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('kra', 'kpi')),
  name text not null check (length(btrim(name)) > 0),
  description text,
  system_metric text check (
    system_metric in ('attendance', 'punctuality', 'task_completion', 'task_on_time', 'planning')
  ),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, name)
);
drop trigger if exists trg_performance_items_updated on public.performance_items;
create trigger trg_performance_items_updated before update on public.performance_items
  for each row execute function public.set_updated_at();

-- 3. Defaults per designation, and the per-user list --------------------------
create table if not exists public.designation_performance_items (
  designation_id uuid not null references public.designations(id) on delete cascade,
  item_id uuid not null references public.performance_items(id) on delete cascade,
  primary key (designation_id, item_id)
);

create table if not exists public.user_performance_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.performance_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- 4. Appraisal scorecard ------------------------------------------------------
-- item_name / kind are snapshotted so a later rename or removal in the master
-- does not rewrite an appraisal that was already scored.
create table if not exists public.appraisal_item_scores (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  item_id uuid references public.performance_items(id) on delete set null,
  kind text not null check (kind in ('kra', 'kpi')),
  item_name text not null,
  sort_order integer not null default 0,
  system_metric text,
  system_score numeric(4, 1) check (system_score between 0 and 10),
  system_remarks text,
  employee_score numeric(4, 1) check (employee_score between 0 and 10),
  employee_remarks text,
  manager_score numeric(4, 1) check (manager_score between 0 and 10),
  manager_remarks text,
  hr_score numeric(4, 1) check (hr_score between 0 and 10),
  hr_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appraisal_id, item_id)
);
create index if not exists idx_appraisal_item_scores_appraisal
  on public.appraisal_item_scores(appraisal_id);
drop trigger if exists trg_appraisal_item_scores_updated on public.appraisal_item_scores;
create trigger trg_appraisal_item_scores_updated before update on public.appraisal_item_scores
  for each row execute function public.set_updated_at();

-- 5. RLS ----------------------------------------------------------------------
alter table public.designations enable row level security;
alter table public.performance_items enable row level security;
alter table public.designation_performance_items enable row level security;
alter table public.user_performance_items enable row level security;
alter table public.appraisal_item_scores enable row level security;

-- Masters: everyone reads, admins (users.manage / appraisal.manage) write.
drop policy if exists designations_select on public.designations;
create policy designations_select on public.designations
  for select to authenticated using (true);
drop policy if exists designations_write on public.designations;
create policy designations_write on public.designations
  for all to authenticated
  using (public.has_permission('users.manage') or public.has_permission('appraisal.manage'))
  with check (public.has_permission('users.manage') or public.has_permission('appraisal.manage'));

drop policy if exists performance_items_select on public.performance_items;
create policy performance_items_select on public.performance_items
  for select to authenticated using (true);
drop policy if exists performance_items_write on public.performance_items;
create policy performance_items_write on public.performance_items
  for all to authenticated
  using (public.has_permission('users.manage') or public.has_permission('appraisal.manage'))
  with check (public.has_permission('users.manage') or public.has_permission('appraisal.manage'));

drop policy if exists designation_items_select on public.designation_performance_items;
create policy designation_items_select on public.designation_performance_items
  for select to authenticated using (true);
drop policy if exists designation_items_write on public.designation_performance_items;
create policy designation_items_write on public.designation_performance_items
  for all to authenticated
  using (public.has_permission('users.manage') or public.has_permission('appraisal.manage'))
  with check (public.has_permission('users.manage') or public.has_permission('appraisal.manage'));

-- A person's KRA / KPI list: themself, their reporting manager, or admins.
drop policy if exists user_items_select on public.user_performance_items;
create policy user_items_select on public.user_performance_items
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('users.view')
    or public.has_permission('appraisal.view')
    or exists (
      select 1 from public.profiles p
       where p.id = user_performance_items.user_id and p.reporting_manager_id = auth.uid()
    )
  );
drop policy if exists user_items_write on public.user_performance_items;
create policy user_items_write on public.user_performance_items
  for all to authenticated
  using (public.has_permission('users.manage') or public.has_permission('appraisal.manage'))
  with check (public.has_permission('users.manage') or public.has_permission('appraisal.manage'));

-- Reporting managers must be able to open their team's appraisals to score
-- them. Additive policy; the existing own / appraisal.view policy stays.
drop policy if exists appraisals_select_manager on public.appraisals;
create policy appraisals_select_manager on public.appraisals
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = appraisals.user_id and p.reporting_manager_id = auth.uid()
    )
  );

-- Scores are readable by whoever can read the appraisal (the subquery runs
-- under the caller's RLS on appraisals). Writes go through the functions below.
drop policy if exists appraisal_item_scores_select on public.appraisal_item_scores;
create policy appraisal_item_scores_select on public.appraisal_item_scores
  for select to authenticated
  using (exists (select 1 from public.appraisals a where a.id = appraisal_item_scores.appraisal_id));

-- 6. Functions ----------------------------------------------------------------

-- Who is the caller for this appraisal? Returns the roles they may score as.
create or replace function public.appraisal_scoring_roles(p_appraisal uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_manager uuid;
  v_roles text[] := '{}';
begin
  select a.user_id, p.reporting_manager_id into v_user, v_manager
    from public.appraisals a join public.profiles p on p.id = a.user_id
   where a.id = p_appraisal;
  if v_user is null then return v_roles; end if;
  if v_user = auth.uid() then v_roles := array_append(v_roles, 'employee'); end if;
  -- An admin may enter the manager column too, otherwise an employee with no
  -- reporting manager could never get a manager score.
  if v_manager = auth.uid() or public.has_permission('appraisal.manage') then
    v_roles := array_append(v_roles, 'manager');
  end if;
  if public.has_permission('appraisal.manage') then v_roles := array_append(v_roles, 'hr'); end if;
  return v_roles;
end;
$$;
grant execute on function public.appraisal_scoring_roles(uuid) to authenticated;

-- Build / refresh the scorecard for one appraisal: add a row for every KRA /
-- KPI currently assigned to the employee (rows already scored are kept), then
-- recompute the System column from attendance, tasks and planning in the
-- cycle's period. Idempotent.
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

-- Save one party's number + remark for one KRA / KPI. Each change is written
-- to appraisal_history so corrections stay traceable.
create or replace function public.save_appraisal_item_score(
  p_score uuid, p_role text, p_value numeric, p_remarks text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.appraisal_item_scores;
  v_status text;
  v_old_value numeric;
  v_old_remarks text;
  v_new_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
  v_label text;
begin
  if p_role not in ('employee', 'manager', 'hr') then raise exception 'invalid role'; end if;
  if p_value is not null and (p_value < 0 or p_value > 10) then
    raise exception 'score must be between 0 and 10';
  end if;
  select * into s from public.appraisal_item_scores where id = p_score;
  if not found then raise exception 'score row not found'; end if;
  if not (p_role = any (public.appraisal_scoring_roles(s.appraisal_id))) then
    raise exception 'not allowed to score as %', p_role;
  end if;
  select c.status into v_status
    from public.appraisals a join public.appraisal_cycles c on c.id = a.cycle_id
   where a.id = s.appraisal_id;
  if v_status <> 'open' then raise exception 'this appraisal cycle is closed'; end if;

  if p_role = 'employee' then
    v_old_value := s.employee_score; v_old_remarks := s.employee_remarks;
    update public.appraisal_item_scores
       set employee_score = p_value, employee_remarks = v_new_remarks where id = p_score;
  elsif p_role = 'manager' then
    v_old_value := s.manager_score; v_old_remarks := s.manager_remarks;
    update public.appraisal_item_scores
       set manager_score = p_value, manager_remarks = v_new_remarks where id = p_score;
  else
    v_old_value := s.hr_score; v_old_remarks := s.hr_remarks;
    update public.appraisal_item_scores
       set hr_score = p_value, hr_remarks = v_new_remarks where id = p_score;
  end if;

  v_label := upper(s.kind) || ' · ' || s.item_name || ' · ' || p_role;
  if v_old_value is distinct from p_value then
    insert into public.appraisal_history (appraisal_id, changed_by, field, old_value, new_value)
    values (s.appraisal_id, auth.uid(), v_label || ' score', v_old_value::text, p_value::text);
  end if;
  if v_old_remarks is distinct from v_new_remarks then
    insert into public.appraisal_history (appraisal_id, changed_by, field, old_value, new_value)
    values (s.appraisal_id, auth.uid(), v_label || ' remarks', v_old_remarks, v_new_remarks);
  end if;
end;
$$;
grant execute on function public.save_appraisal_item_score(uuid, text, numeric, text) to authenticated;
