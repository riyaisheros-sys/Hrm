-- Who is counted for attendance (client report, 20 Nov: dashboard Absent was
-- always wrong because accounts that never mark attendance — owners,
-- directors — were counted absent every day).
--
-- profiles.attendance_exempt:
--   null  (default) automatic — not counted until the person marks attendance
--                   for the first time
--   true            never counted absent
--   false           always counted (e.g. a new joiner who has not punched yet)
--
-- Additive: one nullable column, no data written.

alter table public.profiles
  add column if not exists attendance_exempt boolean;
