-- Add KRA/KPI to the user master (profiles).
--
-- Client meeting ask: "KRA /KPI in user master". KRA/KPI already exist on the
-- appraisals table (per cycle), but the client wants a stable, per-user record
-- on the profile itself so admins can set an employee's standing KRA/KPI once
-- in Users and have it carry across cycles. Appraisals keep their own fields
-- (so a cycle can override), these two columns are the baseline.

alter table public.profiles
  add column if not exists kra text,
  add column if not exists kpi text;
