-- Planning (client, 26 Nov)
--
-- 1. Unlock history: edit the remark, or remove an unlock.
--    Removing an unlock UNDOES it: the day is no longer marked unlocked and
--    the history row goes. If that day's planning is still incomplete and it
--    is still the employee's last worked day, punch-in locks again. Both
--    actions need attendance.unlock (the same right as unlocking) and are
--    written to audit_log.
--
-- 2. Several tasks in one planning slot. planning_slot_tasks links a slot to
--    any number of tasks; planning_slots.task_id stays as the slot's first
--    task so everything that reads it keeps working.

-- 1 ── unlock edit / remove ──────────────────────────────────────────────────
create or replace function public.edit_planning_unlock(p_id uuid, p_remarks text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.planning_unlock_history;
begin
  if not public.has_permission('attendance.unlock') then
    raise exception 'not allowed to edit unlocks';
  end if;
  if p_remarks is null or length(trim(p_remarks)) = 0 then
    raise exception 'a remark is required';
  end if;
  select * into v_row from public.planning_unlock_history where id = p_id;
  if not found then raise exception 'unlock not found'; end if;

  update public.planning_unlock_history set remarks = trim(p_remarks) where id = p_id;
  update public.planning_compliance set unlock_remarks = trim(p_remarks), updated_at = now()
   where user_id = v_row.user_id and work_date = v_row.work_date and unlocked;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), 'planning_unlock.edit', 'planning_unlock_history', p_id,
          jsonb_build_object('remarks', v_row.remarks),
          jsonb_build_object('remarks', trim(p_remarks)));
end;
$$;

create or replace function public.remove_planning_unlock(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.planning_unlock_history;
begin
  if not public.has_permission('attendance.unlock') then
    raise exception 'not allowed to remove unlocks';
  end if;
  select * into v_row from public.planning_unlock_history where id = p_id;
  if not found then raise exception 'unlock not found'; end if;

  delete from public.planning_unlock_history where id = p_id;
  -- Undo the unlock only when no other unlock of the same day remains.
  if not exists (
    select 1 from public.planning_unlock_history
     where user_id = v_row.user_id and work_date = v_row.work_date
  ) then
    update public.planning_compliance
       set unlocked = false, unlocked_by = null, unlocked_at = null,
           unlock_remarks = null, updated_at = now()
     where user_id = v_row.user_id and work_date = v_row.work_date;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), 'planning_unlock.remove', 'planning_unlock_history', p_id,
          to_jsonb(v_row), null);
end;
$$;

revoke all on function public.edit_planning_unlock(uuid, text) from public, anon;
revoke all on function public.remove_planning_unlock(uuid) from public, anon;
grant execute on function public.edit_planning_unlock(uuid, text) to authenticated;
grant execute on function public.remove_planning_unlock(uuid) to authenticated;

-- 2 ── several tasks per slot ────────────────────────────────────────────────
create table if not exists public.planning_slot_tasks (
  slot_id uuid not null references public.planning_slots(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, task_id)
);
create index if not exists idx_planning_slot_tasks_task on public.planning_slot_tasks(task_id);

alter table public.planning_slot_tasks enable row level security;

drop policy if exists planning_slot_tasks_select on public.planning_slot_tasks;
create policy planning_slot_tasks_select on public.planning_slot_tasks for select to authenticated
  using (exists (
    select 1 from public.planning_slots s
     where s.id = slot_id
       and (s.user_id = auth.uid() or public.has_permission('planning.view_all'))
  ));

drop policy if exists planning_slot_tasks_write on public.planning_slot_tasks;
create policy planning_slot_tasks_write on public.planning_slot_tasks for all to authenticated
  using (exists (select 1 from public.planning_slots s where s.id = slot_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.planning_slots s where s.id = slot_id and s.user_id = auth.uid()));

grant select, insert, delete on public.planning_slot_tasks to authenticated;

-- Existing single-task slots become one link each.
insert into public.planning_slot_tasks (slot_id, task_id)
select id, task_id from public.planning_slots where task_id is not null
on conflict do nothing;
