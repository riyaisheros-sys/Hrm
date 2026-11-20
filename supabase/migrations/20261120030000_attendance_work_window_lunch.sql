-- Attendance settings (client ask, 20 Nov): the admin fixes the day's working
-- hours and attendance is counted from them; lunch time is not counted.
--
-- Three additive settings on the single attendance_config row, all OFF / empty
-- by default so nothing changes until the admin turns them on:
--
--   count_within_work_hours  only time between work_start and work_end counts
--                            (arriving early or staying late no longer makes
--                             up for a late start / early exit)
--   lunch_start, lunch_end   the lunch window
--   exclude_lunch            time inside the lunch window is not counted, and
--                            breaks are no longer credited back
--
-- The counting itself moves into attendance_segment_minutes() so the rule is
-- in one place. recompute_attendance_day keeps everything it did before
-- (incl. the partial-leave credit); overtime is still measured on real time
-- at work. Only days recomputed after a switch is turned on are affected —
-- past days are not rewritten.

alter table public.attendance_config
  add column if not exists count_within_work_hours boolean not null default false,
  add column if not exists exclude_lunch boolean not null default false,
  add column if not exists lunch_start time,
  add column if not exists lunch_end time;

alter table public.attendance_config drop constraint if exists attendance_config_lunch_check;
alter table public.attendance_config add constraint attendance_config_lunch_check
  check (lunch_start is null or lunch_end is null or lunch_end > lunch_start);

-- Minutes that count for one punch-in → punch-out segment under the settings.
create or replace function public.attendance_segment_minutes(p_in timestamptz, p_out timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.attendance_config;
  l_in timestamp;
  l_out timestamp;
  v_day date;
  v_minutes int;
  v_lunch_from timestamp;
  v_lunch_to timestamp;
begin
  select * into cfg from public.attendance_config where id;
  l_in := p_in at time zone cfg.timezone;
  l_out := p_out at time zone cfg.timezone;
  v_day := l_in::date;

  if cfg.count_within_work_hours then
    l_in := greatest(l_in, v_day + cfg.work_start);
    l_out := least(l_out, v_day + cfg.work_end);
  end if;
  if l_out <= l_in then return 0; end if;

  v_minutes := ceil(extract(epoch from (l_out - l_in)) / 60.0);

  if cfg.exclude_lunch and cfg.lunch_start is not null and cfg.lunch_end is not null then
    v_lunch_from := greatest(l_in, v_day + cfg.lunch_start);
    v_lunch_to := least(l_out, v_day + cfg.lunch_end);
    if v_lunch_to > v_lunch_from then
      v_minutes := v_minutes - floor(extract(epoch from (v_lunch_to - v_lunch_from)) / 60.0);
    end if;
  end if;

  return greatest(0, v_minutes);
end;
$$;
grant execute on function public.attendance_segment_minutes(timestamptz, timestamptz)
  to authenticated, service_role;

create or replace function public.recompute_attendance_day(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.attendance_config;
  r record;
  v_today date;
  v_open timestamptz := null;
  v_first_in timestamptz := null;
  v_last_out timestamptz := null;
  v_prev_out timestamptz := null;
  v_close timestamptz;
  v_worked int := 0;
  v_raw int := 0;
  v_gap int := 0;
  v_credited int := 0;
  v_count int := 0;
  v_status text;
  v_late boolean := false;
  v_late_min int := 0;
  v_missed boolean := false;
  v_ot int := 0;
  v_local_in time;
  v_leave_credit int := 0;
begin
  -- An admin-corrected day is authoritative until it is reset.
  if exists (select 1 from public.attendance_days
             where user_id = p_user and work_date = p_date and is_manual) then
    return;
  end if;

  select * into cfg from public.attendance_config where id;
  v_today := (now() at time zone cfg.timezone)::date;

  for r in
    select punch_type, punched_at
    from public.attendance_punches
    where user_id = p_user and work_date = p_date
    order by punched_at asc
  loop
    v_count := v_count + 1;
    if r.punch_type = 'in' then
      if v_first_in is null then v_first_in := r.punched_at; end if;
      if v_open is null then
        v_open := r.punched_at;
        if v_prev_out is not null then
          v_gap := v_gap + floor(extract(epoch from (r.punched_at - v_prev_out)) / 60.0);
        end if;
      end if;
    else
      if v_open is not null then
        v_worked := v_worked + public.attendance_segment_minutes(v_open, r.punched_at);
        v_raw := v_raw + ceil(extract(epoch from (r.punched_at - v_open)) / 60.0);
        v_open := null;
      end if;
      v_last_out := r.punched_at;
      v_prev_out := r.punched_at;
    end if;
  end loop;

  if v_open is not null then
    if p_date >= v_today then
      v_worked := v_worked + public.attendance_segment_minutes(v_open, now());
      v_raw := v_raw + ceil(extract(epoch from (now() - v_open)) / 60.0);
    else
      v_missed := true;
      v_close := (p_date + cfg.work_end) at time zone cfg.timezone;
      if v_close > v_open then
        v_worked := v_worked + public.attendance_segment_minutes(v_open, v_close);
        v_raw := v_raw + ceil(extract(epoch from (v_close - v_open)) / 60.0);
      end if;
    end if;
  end if;

  -- When lunch is excluded the thresholds are net working hours, so breaks are
  -- not credited back (otherwise punching out for lunch would re-add it).
  v_credited := v_worked
    + case when cfg.exclude_lunch then 0 else least(v_gap, cfg.break_minutes) end;

  -- NEW: credit approved partial-leave minutes for this user & date.
  -- Only partial leaves (quarter / half) contribute — a full-day leave day
  -- has no punches and so never reaches this function.
  select coalesce(sum(
    case lr.duration
      when 'quarter_day' then (cfg.full_day_hours * 60 * 0.25)::int
      when 'half_day'    then (cfg.full_day_hours * 60 * 0.5)::int
      else 0
    end
  ), 0)
  into v_leave_credit
  from public.leave_requests lr
  where lr.user_id = p_user
    and lr.status = 'approved'
    and lr.deleted_at is null
    and p_date between lr.start_date and lr.end_date
    and lr.duration in ('half_day', 'quarter_day');

  v_credited := v_credited + v_leave_credit;

  if v_first_in is not null then
    v_local_in := (v_first_in at time zone cfg.timezone)::time;
    v_late := v_local_in > (cfg.work_start + make_interval(mins => cfg.grace_minutes));
    if v_late then
      v_late_min := floor(extract(epoch from (v_local_in - cfg.work_start)) / 60.0);
    end if;
  end if;

  v_status := public.attendance_status_for(v_credited);

  if v_open is not null and not v_missed and v_status <> 'full_day' then
    v_status := 'present';
  end if;

  -- Overtime is measured on the actual time at work, not the counted window,
  -- so staying late still registers when counting is limited to office hours.
  v_ot := greatest(0, v_raw - (cfg.overtime_after_hours * 60)::int);

  insert into public.attendance_days (
    user_id, work_date, first_in_at, last_out_at, worked_minutes, credited_minutes, status,
    is_late, late_minutes, missed_punch_out, overtime_minutes, punch_count
  )
  values (p_user, p_date, v_first_in, v_last_out, v_worked, v_credited, v_status,
          v_late, v_late_min, v_missed, v_ot, v_count)
  on conflict (user_id, work_date) do update set
    first_in_at = excluded.first_in_at,
    last_out_at = excluded.last_out_at,
    worked_minutes = excluded.worked_minutes,
    credited_minutes = excluded.credited_minutes,
    status = excluded.status,
    is_late = excluded.is_late,
    late_minutes = excluded.late_minutes,
    missed_punch_out = excluded.missed_punch_out,
    overtime_minutes = excluded.overtime_minutes,
    punch_count = excluded.punch_count,
    updated_at = now();
end;
$$;

revoke all on function public.recompute_attendance_day(uuid, date) from public;
grant execute on function public.recompute_attendance_day(uuid, date) to service_role;
