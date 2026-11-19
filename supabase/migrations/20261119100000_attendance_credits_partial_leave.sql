-- Attendance classifier should credit approved partial leaves.
--
-- Client complaint (19 Nov):
--   • "2 hour leave counted as half day" — someone on an approved 2-hour
--     (quarter-day) leave who physically works ~6.5h is classified half_day,
--     when with the leave it should be a full_day.
--   • "10 min shortfall still classed as half_day, not quarter_day" — same
--     root cause: partial leave minutes never credited.
--
-- Fix: when recomputing an attendance day, add the minute-equivalent of any
-- approved partial leave (quarter_day = 25% of full-day target, half_day =
-- 50%) to credited_minutes before the status classifier runs. Full-day
-- leaves still don't surface here — those days have no punches and never
-- generate an attendance_days row.
--
-- A backfill at the end re-runs recompute_attendance_day for every (user,
-- date) that has both an existing attendance_days row and a partial
-- approved leave, so historical rows get the corrected status.

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
        v_worked := v_worked + ceil(extract(epoch from (r.punched_at - v_open)) / 60.0);
        v_open := null;
      end if;
      v_last_out := r.punched_at;
      v_prev_out := r.punched_at;
    end if;
  end loop;

  if v_open is not null then
    if p_date >= v_today then
      v_worked := v_worked + ceil(extract(epoch from (now() - v_open)) / 60.0);
    else
      v_missed := true;
      v_close := (p_date + cfg.work_end) at time zone cfg.timezone;
      if v_close > v_open then
        v_worked := v_worked + ceil(extract(epoch from (v_close - v_open)) / 60.0);
      end if;
    end if;
  end if;

  v_credited := v_worked + least(v_gap, cfg.break_minutes);

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

  v_ot := greatest(0, v_worked - (cfg.overtime_after_hours * 60)::int);

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

-- Backfill: re-run for every (user, date) that both has an attendance row
-- and overlaps an approved partial leave. Idempotent; untouched for
-- manually-corrected rows (the function returns early for those).
do $$
declare
  r record;
begin
  for r in
    select distinct ad.user_id, ad.work_date
    from public.attendance_days ad
    join public.leave_requests lr
      on lr.user_id = ad.user_id
     and ad.work_date between lr.start_date and lr.end_date
    where lr.status = 'approved'
      and lr.deleted_at is null
      and lr.duration in ('half_day', 'quarter_day')
      and not ad.is_manual
  loop
    perform public.recompute_attendance_day(r.user_id, r.work_date);
  end loop;
end $$;
