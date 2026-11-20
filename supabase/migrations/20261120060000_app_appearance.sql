-- Platform-wide appearance settings, managed from Centralized Masters.
--
-- Client ask (20 Nov): "option to color change heading in the centralised
-- master, platform wise we need heading color change option". One row holds
-- the colour used for every table heading in the app; null = default grey.
-- Everyone signed in reads it; only users.manage can change it.

create table if not exists public.app_appearance (
  id boolean primary key default true check (id),
  table_head_color text
    check (table_head_color is null or table_head_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.app_appearance (id) values (true) on conflict (id) do nothing;

alter table public.app_appearance enable row level security;

drop policy if exists app_appearance_select on public.app_appearance;
create policy app_appearance_select on public.app_appearance
  for select to authenticated using (true);

drop policy if exists app_appearance_write on public.app_appearance;
create policy app_appearance_write on public.app_appearance
  for all to authenticated
  using (public.has_permission('users.manage'))
  with check (public.has_permission('users.manage'));

drop trigger if exists trg_app_appearance_updated on public.app_appearance;
create trigger trg_app_appearance_updated before update on public.app_appearance
  for each row execute function public.set_updated_at();

grant select, insert, update on public.app_appearance to authenticated;
