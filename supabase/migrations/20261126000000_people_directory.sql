-- Colleague directory (client, 26 Nov): "Employee sirf self-assign hi kar pa
-- raha hai" even with tasks.assign on their role.
--
-- profiles RLS only lets an employee read their own row (and their direct
-- reports'), so the "assign to" picker, the recognition picker and the
-- assigner / assignee names on shared tasks were empty for employees.
--
-- This function returns only the work identity of each person — name, work
-- email, employee code, photo, status, department — to any signed-in user.
-- Phone and every other profile column stay behind the existing RLS.

create or replace function public.people_directory()
returns table (
  id uuid,
  full_name text,
  email text,
  employee_code text,
  avatar_url text,
  status text,
  department_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.employee_code, p.avatar_url, p.status, p.department_id
  from public.profiles p
  where auth.uid() is not null
  order by coalesce(nullif(p.full_name, ''), p.email)
$$;

revoke all on function public.people_directory() from public, anon;
grant execute on function public.people_directory() to authenticated;
