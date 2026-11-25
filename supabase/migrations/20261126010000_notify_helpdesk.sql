-- Helpdesk notifications (client, 26 Nov): "Helpdesk mein agar Raj ko ticket
-- assign kiya hai, toh notification mein show nahi ho raha".
--
--   ticket assigned (new or re-assigned) → the assignee (unless they did it)
--   ticket raised                        → everyone holding helpdesk.manage
--                                          (or '*'), except the person raising it
--   ticket status changed                → the person who raised it (unless
--                                          they changed it themselves)
--
-- Rows are written by a security-definer trigger; clients still cannot insert
-- notifications. Nothing existing is modified.

create or replace function public.notify_ticket_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_raiser text;
begin
  select coalesce(nullif(p.full_name, ''), p.email) into v_raiser
    from public.profiles p where p.id = new.raised_by;

  -- Assigned to someone (on creation, or a change of assignee).
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and new.assigned_to is distinct from v_actor then
    insert into public.notifications (user_id, kind, title, body, link, payload)
    values (
      new.assigned_to,
      'ticket_assigned',
      'Helpdesk ticket assigned to you',
      coalesce(new.subject, 'Ticket') || ' · raised by ' || coalesce(v_raiser, 'an employee')
        || ' · ' || coalesce(new.priority, 'medium') || ' priority',
      '/helpdesk',
      jsonb_build_object('ticket_id', new.id)
    );
  end if;

  -- New ticket → helpdesk managers.
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, title, body, link, payload)
    select distinct ur.user_id,
           'ticket_raised',
           'New helpdesk ticket',
           coalesce(v_raiser, 'An employee') || ': ' || coalesce(new.subject, 'Ticket'),
           '/helpdesk',
           jsonb_build_object('ticket_id', new.id)
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions pm on pm.id = rp.permission_id
      join public.profiles ap on ap.id = ur.user_id and ap.status = 'active'
     where pm.key in ('helpdesk.manage', '*')
       and ur.user_id <> new.raised_by
       and ur.user_id is distinct from new.assigned_to;
  end if;

  -- Status changed → the person who raised it.
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.raised_by is distinct from v_actor then
    insert into public.notifications (user_id, kind, title, body, link, payload)
    values (
      new.raised_by,
      'ticket_status',
      'Your helpdesk ticket is ' || replace(coalesce(new.status, 'updated'), '_', ' '),
      coalesce(new.subject, 'Ticket'),
      '/helpdesk',
      jsonb_build_object('ticket_id', new.id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_ticket_events on public.tickets;
create trigger trg_notify_ticket_events
  after insert or update of assigned_to, status on public.tickets
  for each row execute function public.notify_ticket_events();
