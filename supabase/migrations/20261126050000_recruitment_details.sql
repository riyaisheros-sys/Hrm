-- Recruitment (client, 26 Nov): "Recruitment mein Delete ka option nahi hai"
-- and "Recruitment form mein aur details add karni hain".
--
-- Delete and edit already pass RLS for recruitment.manage (openings_write /
-- candidates_write are FOR ALL); this adds the details a recruitment form
-- usually carries. All columns are optional, so existing rows are untouched.
-- Openings also get an 'on_hold' status.

alter table public.job_openings
  add column if not exists positions integer check (positions is null or positions > 0),
  add column if not exists location text,
  add column if not exists employment_type text
    check (employment_type is null or employment_type in ('full_time', 'part_time', 'contract', 'internship')),
  add column if not exists experience_required text,
  add column if not exists salary_range text,
  add column if not exists closing_date date,
  add column if not exists hiring_manager_id uuid references public.profiles(id) on delete set null;

alter table public.job_openings drop constraint if exists job_openings_status_check;
alter table public.job_openings add constraint job_openings_status_check
  check (status in ('open', 'on_hold', 'closed'));

alter table public.candidates
  add column if not exists current_company text,
  add column if not exists current_designation text,
  add column if not exists experience_years numeric(4,1) check (experience_years is null or experience_years >= 0),
  add column if not exists current_ctc numeric(12,2) check (current_ctc is null or current_ctc >= 0),
  add column if not exists expected_ctc numeric(12,2) check (expected_ctc is null or expected_ctc >= 0),
  add column if not exists notice_period_days integer check (notice_period_days is null or notice_period_days >= 0),
  add column if not exists location text,
  add column if not exists source text,
  add column if not exists referred_by text,
  add column if not exists skills text,
  add column if not exists notes text;
