-- Visitors (client, 26 Nov): "Visitors/Meetings mein Delete ka option hona
-- chahiye" and "Visitor Pass Code ko remove karne ka option hona chahiye".
--
-- • pass_code may now be empty: removing a pass revokes it (it can be issued
--   again later). New visitors still get a code automatically.
-- • The employee who registered a visitor (the host) may now update — e.g.
--   remove the pass — and delete that visitor. Admins with visitors.manage
--   could already do both.

alter table public.visitors alter column pass_code drop not null;

drop policy if exists visitors_update_own on public.visitors;
create policy visitors_update_own on public.visitors for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists visitors_delete_own on public.visitors;
create policy visitors_delete_own on public.visitors for delete to authenticated
  using (host_id = auth.uid());
