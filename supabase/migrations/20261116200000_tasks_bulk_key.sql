-- Bulk assign — group rows back together in the UI.
--
-- Client meeting: "wahi tasks sabhi ko assign karna hai and sabhi ko wo task
-- show ho … ek hi task me assignee show ho". The data model stays one row per
-- assignee (keeps accept/submit/capacity per-person and RLS clean). A shared
-- nullable UUID lets the UI collapse those rows into a single, expandable row
-- in All Tasks, and keeps each assignee's own row as-is in My Tasks.
--
-- Nullable so existing single-assignee tasks (and imports) keep working.

alter table public.tasks
  add column if not exists bulk_key uuid;

create index if not exists tasks_bulk_key_idx on public.tasks(bulk_key) where bulk_key is not null;
