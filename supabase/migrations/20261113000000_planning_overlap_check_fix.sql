-- Planning overlap check — fix for upsert-time false positive.
--
-- The original trigger (20261104000000) excluded the row being edited by
-- comparing `id`. That works for plain UPDATEs, but NOT for the frontend's
-- upsert path (INSERT ... ON CONFLICT (user_id, plan_date, kind, slot_index)
-- DO UPDATE ...). The BEFORE INSERT fires BEFORE conflict resolution, so
-- NEW.id is always a freshly generated UUID — different from the existing
-- row's id — and the trigger incorrectly treated the "same" slot as another
-- row, rejecting every edit with "overlap".
--
-- Fix: compare on the conflict key (kind + slot_index) instead of id, so the
-- row being upserted is always excluded regardless of which id it carries.

create or replace function public.check_planning_no_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_time is null or new.end_time is null then
    return new;
  end if;
  if exists (
    select 1 from public.planning_slots
    where user_id = new.user_id
      and plan_date = new.plan_date
      -- Exclude the SAME slot (same business key) regardless of its id.
      and (kind, slot_index) is distinct from (new.kind, new.slot_index)
      and start_time is not null and end_time is not null
      and new.start_time < end_time
      and new.end_time > start_time
  ) then
    raise exception 'planning_overlap: this time range overlaps with another slot on the same day'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
