-- Masters for every module (client, 26 Nov):
--   Recognition → award types (and create new awards)
--   Notice Board → categories
--   Visitors & Meetings → visit purposes
--   Assets → asset types
--   Workflow → entity types
--
-- Each module used to hard-code its list (three of them with a CHECK
-- constraint). Every list now lives in a master table with the same shape as
-- the other masters (code, name, active, sequence) and the same audit trail.
-- The modules keep storing the item's code in their existing text column, so
-- existing records are untouched; the masters are seeded with today's values.

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('recognition_awards',      'recognition.manage'),
      ('announcement_categories', 'announcements.manage'),
      ('visit_purposes',          'visitors.manage'),
      ('asset_types',             'assets.manage'),
      ('workflow_entity_types',   'workflow.manage')
    ) as v(tbl, perm)
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id uuid primary key default gen_random_uuid(),
        code text not null unique check (code ~ '^[a-z0-9_]+$'),
        name text not null,
        is_active boolean not null default true,
        sort_order integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table public.%1$I enable row level security;
      drop policy if exists %2$I on public.%1$I;
      create policy %2$I on public.%1$I for select to authenticated using (true);
      drop policy if exists %3$I on public.%1$I;
      create policy %3$I on public.%1$I for all to authenticated
        using (public.has_permission('users.manage') or public.has_permission(%4$L))
        with check (public.has_permission('users.manage') or public.has_permission(%4$L));
      drop trigger if exists %5$I on public.%1$I;
      create trigger %5$I before update on public.%1$I
        for each row execute function public.set_updated_at();
      drop trigger if exists %6$I on public.%1$I;
      create trigger %6$I after insert or update or delete on public.%1$I
        for each row execute function public.audit_master_change();
      grant select, insert, update, delete on public.%1$I to authenticated;
    $f$, t.tbl, t.tbl || '_select', t.tbl || '_write', t.perm,
         'trg_' || t.tbl || '_updated', 'trg_' || t.tbl || '_audit');
  end loop;
end $$;

-- Awards carry default points for a recognition.
alter table public.recognition_awards
  add column if not exists points integer not null default 10 check (points >= 0);

insert into public.recognition_awards (code, name, points, sort_order) values
  ('star_performer', 'Star Performer', 20, 1),
  ('employee_of_month', 'Employee of the Month', 50, 2),
  ('appreciation', 'Appreciation', 10, 3)
on conflict (code) do nothing;

insert into public.announcement_categories (code, name, sort_order) values
  ('news', 'News', 1), ('holiday', 'Holiday', 2), ('meeting', 'Meeting', 3),
  ('policy', 'Policy', 4), ('birthday', 'Birthday', 5), ('alert', 'Alert', 6)
on conflict (code) do nothing;

insert into public.visit_purposes (code, name, sort_order) values
  ('client_meeting', 'Client meeting', 1), ('interview', 'Interview', 2),
  ('vendor', 'Vendor / supplier', 3), ('delivery', 'Delivery', 4),
  ('internal_meeting', 'Internal meeting', 5), ('personal', 'Personal', 6),
  ('other', 'Other', 7)
on conflict (code) do nothing;

insert into public.asset_types (code, name, sort_order) values
  ('laptop', 'Laptop', 1), ('desktop', 'Desktop', 2), ('mobile', 'Mobile', 3),
  ('sim', 'SIM', 4), ('id_card', 'ID card', 5), ('headset', 'Headset', 6),
  ('other', 'Other', 7)
on conflict (code) do nothing;

insert into public.workflow_entity_types (code, name, sort_order) values
  ('generic', 'General', 1), ('employee', 'Employee', 2), ('recruitment', 'Recruitment', 3),
  ('onboarding', 'Onboarding', 4), ('offboarding', 'Offboarding', 5), ('leave', 'Leave', 6),
  ('expense', 'Expense', 7), ('payroll', 'Payroll', 8), ('asset', 'Asset', 9),
  ('document', 'Document', 10), ('training', 'Training', 11), ('compliance', 'Compliance', 12)
on conflict (code) do nothing;

-- The lists are now managed in the masters, so the hard-coded checks go.
alter table public.recognitions drop constraint if exists recognitions_award_type_check;
alter table public.announcements drop constraint if exists announcements_category_check;
alter table public.assets drop constraint if exists assets_asset_type_check;
