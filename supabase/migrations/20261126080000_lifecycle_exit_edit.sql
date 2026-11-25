-- Employee lifecycle editable (client, 26 Nov: "Employee Lifecycle editable
-- hona chahiye").
--
-- Lifecycle events, resignations and templates were already writable by
-- lifecycle.manage. Exit clearances could only be read (they were cleared
-- through clear_exit_item), so a wrongly cleared item could not be undone.
-- lifecycle.manage may now update them too (undo a clearance).

drop policy if exists clearances_write on public.exit_clearances;
create policy clearances_write on public.exit_clearances for update to authenticated
  using (public.has_permission('lifecycle.manage'))
  with check (public.has_permission('lifecycle.manage'));
