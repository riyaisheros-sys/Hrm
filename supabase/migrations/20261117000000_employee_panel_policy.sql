-- Admin-controlled visibility for the employee's sidebar and dashboard.
--
-- Client meeting (17 Nov): "super admin and admin will have option to toggle
-- on and toggle off what things will show in employee side panel and also in
-- the main dashboard". Two small key/value tables let an admin flip any
-- sidebar item (by its nav testid) or any dashboard widget (by its catalog
-- id) off for ALL employees in one place. Absence of a row means visible.
--
-- Per-user layout preferences still live in sidebar_preferences /
-- dashboard_preferences — this policy is an org-wide gate layered on top.

create table if not exists public.employee_sidebar_policy (
  item_key text primary key,
  is_visible boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.employee_dashboard_policy (
  widget_id text primary key,
  is_visible boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.employee_sidebar_policy enable row level security;
alter table public.employee_dashboard_policy enable row level security;

-- Every signed-in user reads the policy (needed to apply filters in the UI).
-- Only admins with users.manage write to it.
create policy employee_sidebar_policy_select on public.employee_sidebar_policy
  for select to authenticated using (true);
create policy employee_sidebar_policy_write on public.employee_sidebar_policy
  for all to authenticated
  using (public.has_permission('users.manage'))
  with check (public.has_permission('users.manage'));

create policy employee_dashboard_policy_select on public.employee_dashboard_policy
  for select to authenticated using (true);
create policy employee_dashboard_policy_write on public.employee_dashboard_policy
  for all to authenticated
  using (public.has_permission('users.manage'))
  with check (public.has_permission('users.manage'));

drop trigger if exists trg_esp_updated on public.employee_sidebar_policy;
create trigger trg_esp_updated before update on public.employee_sidebar_policy
  for each row execute function public.set_updated_at();

drop trigger if exists trg_edp_updated on public.employee_dashboard_policy;
create trigger trg_edp_updated before update on public.employee_dashboard_policy
  for each row execute function public.set_updated_at();
