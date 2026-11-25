-- Office expenses (client, 26 Nov): "Office Expenses ki entry ka option hona
-- chahiye, jisme bill/document attach kar sakein."
--
-- • office_expenses: one row per expense, with an optional bill stored in the
--   private documents bucket under expenses/<submitter id>/...
-- • expense_categories: a master (Centralized Masters → Expense Categories).
-- • Rights (assign in Organization Roles; super admins already have them):
--     expenses.view    see every expense        expenses.add    enter expenses
--     expenses.edit    edit any expense         expenses.delete delete any expense
--     expenses.manage  all of the above + approve / reject / mark paid
--   Anyone who entered an expense can see it, and can edit or delete it while
--   it is still pending.

insert into public.permissions (key, category, description) values
  ('expenses.view', 'expenses', 'View all office expenses'),
  ('expenses.add', 'expenses', 'Add office expenses'),
  ('expenses.edit', 'expenses', 'Edit office expenses'),
  ('expenses.delete', 'expenses', 'Delete office expenses'),
  ('expenses.manage', 'expenses', 'Manage & approve office expenses')
on conflict (key) do nothing;

-- Category master (same shape and audit as the other masters) ---------------
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.expense_categories enable row level security;
drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories for select to authenticated using (true);
drop policy if exists expense_categories_write on public.expense_categories;
create policy expense_categories_write on public.expense_categories for all to authenticated
  using (public.has_permission('users.manage') or public.has_permission('expenses.manage'))
  with check (public.has_permission('users.manage') or public.has_permission('expenses.manage'));
drop trigger if exists trg_expense_categories_updated on public.expense_categories;
create trigger trg_expense_categories_updated before update on public.expense_categories
  for each row execute function public.set_updated_at();
drop trigger if exists trg_expense_categories_audit on public.expense_categories;
create trigger trg_expense_categories_audit after insert or update or delete on public.expense_categories
  for each row execute function public.audit_master_change();
grant select, insert, update, delete on public.expense_categories to authenticated;

insert into public.expense_categories (code, name, sort_order) values
  ('office_supplies', 'Office supplies', 1),
  ('printing_stationery', 'Printing & stationery', 2),
  ('food_refreshments', 'Food & refreshments', 3),
  ('travel_conveyance', 'Travel & conveyance', 4),
  ('utilities', 'Electricity / internet / phone', 5),
  ('rent', 'Rent', 6),
  ('repairs_maintenance', 'Repairs & maintenance', 7),
  ('courier_postage', 'Courier & postage', 8),
  ('software_subscriptions', 'Software & subscriptions', 9),
  ('other', 'Other', 10)
on conflict (code) do nothing;

-- Expenses -----------------------------------------------------------------
create table if not exists public.office_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  description text not null check (length(trim(description)) > 0),
  vendor text,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode text check (payment_mode is null or payment_mode in
    ('cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other')),
  reference_no text,
  bill_path text,
  bill_name text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'paid')),
  remarks text,
  submitted_by uuid references public.profiles(id) on delete set null default auth.uid(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_office_expenses_date on public.office_expenses(expense_date desc);
create index if not exists idx_office_expenses_submitter on public.office_expenses(submitted_by);

alter table public.office_expenses enable row level security;

drop policy if exists office_expenses_select on public.office_expenses;
create policy office_expenses_select on public.office_expenses for select to authenticated
  using (submitted_by = auth.uid() or public.has_module_action('expenses', 'view'));

drop policy if exists office_expenses_insert on public.office_expenses;
create policy office_expenses_insert on public.office_expenses for insert to authenticated
  with check (submitted_by = auth.uid() and public.has_module_action('expenses', 'add'));

drop policy if exists office_expenses_update on public.office_expenses;
create policy office_expenses_update on public.office_expenses for update to authenticated
  using ((submitted_by = auth.uid() and status = 'pending') or public.has_module_action('expenses', 'edit'))
  with check ((submitted_by = auth.uid()) or public.has_module_action('expenses', 'edit'));

drop policy if exists office_expenses_delete on public.office_expenses;
create policy office_expenses_delete on public.office_expenses for delete to authenticated
  using ((submitted_by = auth.uid() and status = 'pending') or public.has_module_action('expenses', 'delete'));

grant select, insert, update, delete on public.office_expenses to authenticated;

-- Only expense managers change the status; who / when is recorded.
create or replace function public.office_expense_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if not public.has_permission('expenses.manage') then
      raise exception 'only an expense manager can change the status';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_office_expense_status on public.office_expenses;
create trigger trg_office_expense_status before update on public.office_expenses
  for each row execute function public.office_expense_status_guard();

-- Bills: documents bucket, folder expenses/<submitter>/... -------------------
drop policy if exists expense_bill_insert on storage.objects;
create policy expense_bill_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'expenses'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.has_module_action('expenses', 'add')
  );

drop policy if exists expense_bill_select on storage.objects;
create policy expense_bill_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'expenses'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or public.has_module_action('expenses', 'view'))
  );

drop policy if exists expense_bill_delete on storage.objects;
create policy expense_bill_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'expenses'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or public.has_module_action('expenses', 'delete'))
  );
