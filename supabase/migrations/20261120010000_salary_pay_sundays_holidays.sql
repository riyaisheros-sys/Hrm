-- Salary: pay Sundays and holidays (client ask, 20 Nov).
--
-- Until now a day was worth salary ÷ working_days_per_month (26) and only
-- present / half / quarter days and paid leave were paid — Sundays and
-- holidays earned nothing, and a 25-working-day month could never reach the
-- full salary.
--
-- With this switch ON (default) the calculate-salary function instead uses
--   per day   = monthly salary ÷ calendar days in the month
--   paid days = present + half×factor + quarter×factor + paid leave
--               + Sundays + holidays (not worked, already elapsed)
-- so a fully-attended month pays exactly the monthly salary.
-- Switch it OFF to get the previous working-day formula back.
--
-- Additive only: one boolean column on the single policy row.

alter table public.salary_policy
  add column if not exists pay_sundays_holidays boolean not null default true;
