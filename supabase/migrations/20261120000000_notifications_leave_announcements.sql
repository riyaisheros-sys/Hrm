-- More in-app notifications (client ask, 20 Nov): besides "task assigned",
-- the bell should light up for leave requests, leave decisions and admin
-- announcements.
--
--   leave applied            → the applicant's reporting manager + everyone
--                              holding leave.approve (never the applicant)
--   leave approved/rejected  → the employee who applied
--   announcement published   → every active employee except the publisher
--
-- All rows are written by security-definer triggers; clients still cannot
-- insert notifications. Nothing existing is modified.

-- Leave applied --------------------------------------------------------------
create or replace function public.notify_leave_applied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_type text;
begin
  if new.status <> 'pending' then return new; end if;

  select coalesce(nullif(p.full_name, ''), p.email) into v_name
    from public.profiles p where p.id = new.user_id;
  select lt.name into v_type from public.leave_types lt where lt.id = new.leave_type_id;

  insert into public.notifications (user_id, kind, title, body, link, payload)
  select distinct r.user_id,
         'leave_applied',
         'Leave request to review',
         coalesce(v_name, 'An employee') || ' applied for ' || coalesce(v_type, 'leave')
           || ' (' || to_char(new.start_date, 'DD Mon')
           || case when new.end_date <> new.start_date
                   then ' – ' || to_char(new.end_date, 'DD Mon') else '' end
           || ', ' || trim(to_char(new.days, 'FM990.##')) || ' day(s))',
         '/admin/leave',
         jsonb_build_object('leave_request_id', new.id)
  from (
    select p.reporting_manager_id as user_id
      from public.profiles p
     where p.id = new.user_id and p.reporting_manager_id is not null
    union
    select ur.user_id
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions pm on pm.id = rp.permission_id
     -- '*' is the super-admin wildcard that has_permission() also honours.
     where pm.key in ('leave.approve', '*')
  ) r
  join public.profiles ap on ap.id = r.user_id and ap.status = 'active'
  where r.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_leave_applied on public.leave_requests;
create trigger trg_notify_leave_applied
  after insert on public.leave_requests
  for each row execute function public.notify_leave_applied();

-- Leave approved / rejected ---------------------------------------------------
create or replace function public.notify_leave_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_by text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('approved', 'rejected') then return new; end if;

  select lt.name into v_type from public.leave_types lt where lt.id = new.leave_type_id;
  select coalesce(nullif(p.full_name, ''), p.email) into v_by
    from public.profiles p where p.id = new.decided_by;

  insert into public.notifications (user_id, kind, title, body, link, payload)
  values (
    new.user_id,
    'leave_' || new.status,
    case when new.status = 'approved' then 'Leave approved' else 'Leave rejected' end,
    'Your ' || coalesce(v_type, 'leave') || ' for ' || to_char(new.start_date, 'DD Mon')
      || case when new.end_date <> new.start_date
              then ' – ' || to_char(new.end_date, 'DD Mon') else '' end
      || ' was ' || new.status
      || case when v_by is not null then ' by ' || v_by else '' end
      || case when nullif(btrim(coalesce(new.decision_remarks, '')), '') is not null
              then ' — ' || btrim(new.decision_remarks) else '' end,
    '/leave',
    jsonb_build_object('leave_request_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_leave_decided on public.leave_requests;
create trigger trg_notify_leave_decided
  after update of status on public.leave_requests
  for each row execute function public.notify_leave_decided();

-- Announcement published ------------------------------------------------------
create or replace function public.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link, payload)
  select p.id,
         'announcement',
         'Announcement: ' || new.title,
         left(new.body, 200),
         '/announcements',
         jsonb_build_object('announcement_id', new.id, 'category', new.category)
    from public.profiles p
   where p.status = 'active'
     and p.id is distinct from new.published_by;
  return new;
end;
$$;

drop trigger if exists trg_notify_announcement on public.announcements;
create trigger trg_notify_announcement
  after insert on public.announcements
  for each row execute function public.notify_announcement();

-- Live push: the bell subscribes to realtime changes on notifications, but the
-- table was never added to the realtime publication (it only refreshed on the
-- 15-second poll). Add it once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
