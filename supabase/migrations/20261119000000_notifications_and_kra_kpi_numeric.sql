-- Meeting asks (17 Nov → implemented 19 Nov):
--   • "notification which task assigns" — in-app notifications table +
--     a trigger that creates one for the assignee every time a task lands
--     on them (insert or re-assign via update).
--   • "KRA and KPI in numbers we need to add not in paragraph" — add
--     nullable numeric columns next to the existing text ones. The UI
--     switches to number inputs; the old text columns are kept as
--     optional notes so no data is lost.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,          -- 'task_assigned' | future kinds
  title text not null,
  body text,
  link text,                   -- deep-link path inside the SPA (e.g. /tasks)
  payload jsonb,               -- source ids (task_id, etc.) for the UI
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read_at)
  where read_at is null;

alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Writes happen only through triggers (security definer), not from the client.

-- Trigger: when a task is inserted with an assignee that isn't the creator,
-- or an existing task's assignee is changed, notify the new assignee.
create or replace function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator_name text;
begin
  if new.assignee_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;
  -- Self-assigned tasks don't need a notification.
  if new.assignee_id = new.created_by then return new; end if;

  select coalesce(p.full_name, p.email) into creator_name
    from public.profiles p where p.id = new.created_by;

  insert into public.notifications (user_id, kind, title, body, link, payload)
  values (
    new.assignee_id,
    'task_assigned',
    'New task assigned',
    coalesce(creator_name, 'Someone') || ' assigned you: ' || new.title,
    '/tasks',
    jsonb_build_object('task_id', new.id, 'title', new.title)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- ---------------------------------------------------------------------------
-- KRA / KPI numeric columns on the user master
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists kra_value numeric,
  add column if not exists kpi_value numeric;
