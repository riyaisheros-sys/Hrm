import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useUsers } from '@/features/admin/users/hooks'
import { useHolidays } from '@/features/leave/hooks'

/**
 * Who is expected to mark attendance on a given day — the single rule behind
 * the dashboard's Absent tile and the Attendance Monitor's Absent list, so the
 * two can never disagree.
 *
 * Someone is NOT absent when:
 *   • the day is a Sunday or a declared holiday (nobody is expected), or
 *   • they are on approved full-day leave, or
 *   • they are not tracked for attendance at all — either switched off for
 *     them in Users, or (when not set) they have never marked attendance on
 *     any day, e.g. owner / director accounts that only use the admin side.
 */
export interface RosterUser {
  id: string
  full_name: string
  email: string
  status: string
  /** true = never counted, false = always counted, null/undefined = automatic. */
  attendance_exempt?: boolean | null
}

export interface Roster<U extends RosterUser> {
  /** Active employees who are tracked for attendance. */
  expected: U[]
  /** Active accounts left out of attendance counts. */
  notTracked: U[]
  /** Expected, no attendance that day, on approved full-day leave. */
  onLeave: U[]
  /** Expected, no attendance that day, not on leave — the truly absent. */
  notPunched: U[]
  /** 'Sunday' or the holiday's name when nobody is expected; otherwise null. */
  offDay: string | null
}

export function resolveRoster<U extends RosterUser>(input: {
  date: string
  users: U[]
  /** Users who have at least one attendance record on any day. */
  everMarked: Set<string>
  /** Users who have an attendance record on `date`. */
  markedOnDate: Set<string>
  /** Users on approved full-day leave covering `date`. */
  onFullDayLeave: Set<string>
  holidayName: string | null
}): Roster<U> {
  const active = input.users.filter((u) => u.status === 'active')
  const exempt = (u: U) =>
    u.attendance_exempt === true ||
    (u.attendance_exempt == null && !input.everMarked.has(u.id))
  const expected = active.filter((u) => !exempt(u))
  const notTracked = active.filter(exempt)
  const offDay =
    input.holidayName ??
    (new Date(`${input.date}T00:00:00Z`).getUTCDay() === 0 ? 'Sunday' : null)
  const missing = expected.filter((u) => !input.markedOnDate.has(u.id))
  const onLeave = missing.filter((u) => input.onFullDayLeave.has(u.id))
  const notPunched = offDay ? [] : missing.filter((u) => !input.onFullDayLeave.has(u.id))
  return { expected, notTracked, onLeave, notPunched, offDay }
}

/** Users with at least one attendance record, ever (one aggregate query). */
function useEverMarked() {
  return useQuery({
    queryKey: ['attendance-ever-marked'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, attendance_days(count)' as '*')
      if (error) throw error
      const rows = (data ?? []) as unknown as Array<{
        id: string
        attendance_days: Array<{ count: number }>
      }>
      return new Set(
        rows.filter((r) => (r.attendance_days?.[0]?.count ?? 0) > 0).map((r) => r.id),
      )
    },
  })
}

/** Users on approved full-day leave covering `date`. */
function useFullDayLeaveOn(date: string) {
  return useQuery({
    queryKey: ['full-day-leave-on', date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('user_id,duration')
        .eq('status', 'approved')
        .is('deleted_at', null)
        .lte('start_date', date)
        .gte('end_date', date)
      if (error) throw error
      return new Set(
        (data ?? []).filter((r) => (r.duration ?? 'full_day') === 'full_day').map((r) => r.user_id),
      )
    },
  })
}

/**
 * Roster for one day. `markedUserIds` are the users with an attendance record
 * on that date (the caller already has those rows). `ready` is false until
 * the supporting data has loaded — hold the Absent number until then rather
 * than flash a wrong one.
 */
export function useAttendanceRoster(date: string, markedUserIds: string[]) {
  const { data: users = [], isLoading: usersLoading } = useUsers()
  const { data: everData, isLoading: everLoading, isError: everFailed } = useEverMarked()
  // If the lookup fails, count everyone (the old behaviour) rather than no one.
  const everMarked = useMemo(
    () => (everFailed ? new Set(users.map((u) => u.id)) : everData),
    [everFailed, everData, users],
  )
  const { data: onLeave, isLoading: leaveLoading } = useFullDayLeaveOn(date)
  const { data: holidays = [] } = useHolidays()
  const markedKey = markedUserIds.join(',')

  const roster = useMemo(
    () =>
      resolveRoster({
        date,
        users,
        everMarked: everMarked ?? new Set<string>(),
        markedOnDate: new Set(markedKey ? markedKey.split(',') : []),
        onFullDayLeave: onLeave ?? new Set<string>(),
        holidayName: holidays.find((h) => h.holiday_date === date)?.name ?? null,
      }),
    [date, users, everMarked, markedKey, onLeave, holidays],
  )
  return { ...roster, ready: !usersLoading && !everLoading && !leaveLoading }
}
