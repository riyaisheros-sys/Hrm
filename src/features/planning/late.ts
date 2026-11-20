/**
 * Planning discipline: an entry is LATE when it was first entered more than
 * `graceMinutes` after its slot had already ended. (A slot planned before or
 * during its window, and updated afterwards, is on time — only the first
 * entry counts.) Slots without their own end time fall back to the planning
 * day's end.
 *
 * Mirrors public.late_minutes(planning_slots) in the database, which the
 * system KRA / KPI score uses — keep the two in step.
 */
export const DEFAULT_LATE_GRACE_MINUTES = 30

/** The wall-clock moment `iso` shows in `timeZone`, as a UTC-based ms value. */
function wallClockMs(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

/** Minutes after the slot's end at which the entry was made; 0 when on time. */
export function planningLateMinutes(input: {
  planDate: string
  endTime: string | null
  createdAt: string
  graceMinutes?: number | null
  timeZone?: string | null
  dayEnd?: string | null
}): number {
  const end = input.endTime || input.dayEnd || '18:30'
  const [y, m, d] = input.planDate.split('-').map(Number)
  const [hh, mm] = end.split(':').map(Number)
  const slotEnd = Date.UTC(y, m - 1, d, hh, mm, 0)
  const entered = wallClockMs(input.createdAt, input.timeZone || 'Asia/Kolkata')
  const delay = Math.floor((entered - slotEnd) / 60000)
  const grace = input.graceMinutes ?? DEFAULT_LATE_GRACE_MINUTES
  return delay > grace ? delay : 0
}

/** "2h 10m", "45m", "1d 3h" — for "Late by …" labels. */
export function formatLateBy(minutes: number): string {
  if (minutes <= 0) return ''
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`
  return `${mins}m`
}
