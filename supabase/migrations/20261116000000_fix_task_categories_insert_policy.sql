-- Task Categories (Task Groups) — fix insert RLS.
--
-- The original policy (from 20261020000000_planning_task_link.sql) required
-- `created_by = auth.uid()`. That looked right for self-ownership, but the
-- UI (Centralized Masters) is admin-only and the save hook does not send
-- `created_by` — so every Add attempt from Masters hit:
--
--   new row violates row-level security policy for table "task_categories"
--
-- Every other master in the Centralized Masters hub (policy_categories,
-- helpdesk_categories, appraisal_types, document_types, leave_types) gates
-- insert on `has_module_action('tasks|…', 'add')`. task_categories should
-- follow the same pattern.
--
-- Fix: replace the self-ownership insert policy with the admin-style one.
-- No data touched — only a policy definition is swapped.

drop policy if exists task_categories_insert on public.task_categories;

create policy task_categories_insert on public.task_categories
  for insert to authenticated
  with check (
    public.has_module_action('tasks', 'add')
    or public.has_permission('tasks.manage')
  );
