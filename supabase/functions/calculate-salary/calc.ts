// Pure payroll math — no Deno / Supabase imports, so the same file is used by
// the edge function and by the unit tests in src/.

export interface PayrollPolicy {
  working_days_per_month: number
  half_day_factor: number
  quarter_day_factor: number
  paid_leave_paid: boolean
  late_penalty_per_day: number
  overtime_rate_per_hour: number
  planning_penalty_per_day: number
  pf_percent?: number | null
  esic_percent?: number | null
  professional_tax?: number | null
  tds_percent?: number | null
  /** Pay Sundays and holidays (calendar-day basis). Missing = on. */
  pay_sundays_holidays?: boolean | null
}

export interface PayrollInput {
  /** YYYY-MM */
  month: string
  /** Today in the office timezone, YYYY-MM-DD. Off days after it are not counted yet. */
  today: string
  monthlyCtc: number
  policy: PayrollPolicy
  days: Array<{
    status: string
    is_late: boolean | null
    overtime_minutes: number | null
    work_date: string
  }>
  paidLeaveDays: number
  holidays: Array<{ holiday_date: string; name: string }>
  /** Dates whose planning was complete (or admin-unlocked). */
  compliantDates: string[]
  adjustments: Array<{ kind: string; amount: number }>
  /** Employee's first day on record (YYYY-MM-DD). Off days before it are not paid. */
  joinedOn?: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
// Every amount of money is paid in whole rupees (client rule, 20 Nov): each
// line is rounded to the nearest rupee, and totals are sums of rounded lines,
// so the payslip always adds up exactly.
const rupee = (n: number) => Math.round(n)
const num = (n: unknown) => Number(n ?? 0) || 0
const WORKED = new Set(['full_day', 'present', 'half_day', 'quarter_day'])

function sumKind(rows: Array<{ kind: string; amount: number }>, kind: string) {
  return rows.filter((r) => r.kind === kind).reduce((s, r) => s + num(r.amount), 0)
}

/** Every date of the month as YYYY-MM-DD (UTC math, so no timezone drift). */
export function datesOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from(
    { length: count },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
  )
}

const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0

export function computePayroll(input: PayrollInput) {
  const { policy, days, adjustments } = input
  const monthDates = datesOfMonth(input.month)
  const daysInMonth = monthDates.length

  const present = days.filter((d) => d.status === 'full_day' || d.status === 'present').length
  const half = days.filter((d) => d.status === 'half_day').length
  const quarter = days.filter((d) => d.status === 'quarter_day').length
  const absent = days.filter((d) => d.status === 'absent').length
  const lateCount = days.filter((d) => d.is_late).length
  const overtimeMinutes = days.reduce((s, d) => s + num(d.overtime_minutes), 0)

  const halfFactor = num(policy.half_day_factor)
  const quarterFactor = num(policy.quarter_day_factor)
  const paidLeaveDays = policy.paid_leave_paid ? num(input.paidLeaveDays) : 0
  const workedUnits = present + half * halfFactor + quarter * quarterFactor

  // Sundays and holidays --------------------------------------------------
  // Paid when the policy says so, the day has already happened, the employee
  // was on record, and they did not actually work it (a worked Sunday is
  // already counted as a present day). Someone with no attendance and no paid
  // leave in the month earns no off days.
  const payOff = policy.pay_sundays_holidays !== false
  const workedDates = new Set(days.filter((d) => WORKED.has(d.status)).map((d) => d.work_date))
  const holidayByDate = new Map(input.holidays.map((h) => [h.holiday_date, h.name]))
  const eligible = (date: string) =>
    date <= input.today && (!input.joinedOn || date >= input.joinedOn) && !workedDates.has(date)

  let sundayDates: string[] = []
  let holidayList: Array<{ date: string; name: string }> = []
  if (payOff && workedUnits + paidLeaveDays > 0) {
    sundayDates = monthDates.filter((d) => isSunday(d) && eligible(d))
    holidayList = monthDates
      .filter((d) => holidayByDate.has(d) && !isSunday(d) && eligible(d))
      .map((d) => ({ date: d, name: holidayByDate.get(d) ?? 'Holiday' }))
  }
  const sundays = sundayDates.length
  const holidays = holidayList.length

  // Per-day rate ------------------------------------------------------------
  // Paying off days only adds up to the monthly salary if a day is worth
  // salary ÷ calendar days; otherwise keep the configured working-day divisor.
  const dayBasis: 'calendar' | 'working_days' = payOff ? 'calendar' : 'working_days'
  const divisor = payOff ? daysInMonth : num(policy.working_days_per_month)
  const perDay = divisor > 0 ? input.monthlyCtc / divisor : 0

  let paidUnits = workedUnits + paidLeaveDays + sundays + holidays
  if (payOff) paidUnits = Math.min(paidUnits, daysInMonth)

  const compliant = new Set(input.compliantDates)
  const nonCompliant = [...workedDates].filter((d) => !compliant.has(d)).length

  const baseEarned = rupee(perDay * paidUnits)
  const overtimeRate = num(policy.overtime_rate_per_hour)
  const overtimePay = rupee((overtimeMinutes / 60) * overtimeRate)
  const latePenaltyPerDay = num(policy.late_penalty_per_day)
  const latePenalty = rupee(lateCount * latePenaltyPerDay)
  const planningPenaltyPerDay = num(policy.planning_penalty_per_day)
  const planningPenalty = rupee(nonCompliant * planningPenaltyPerDay)
  const incentives = rupee(sumKind(adjustments, 'incentive'))
  const increments = rupee(sumKind(adjustments, 'increment'))
  const adjPenalty = rupee(sumKind(adjustments, 'penalty'))
  const penalties = rupee(adjPenalty + latePenalty + planningPenalty)
  const gross = rupee(baseEarned + overtimePay + incentives + increments)

  const pfPercent = num(policy.pf_percent)
  const esicPercent = num(policy.esic_percent)
  const tdsPercent = num(policy.tds_percent)
  const pf = rupee((baseEarned * pfPercent) / 100)
  const esic = rupee((gross * esicPercent) / 100)
  const professionalTax = rupee(num(policy.professional_tax))
  const tds = rupee((gross * tdsPercent) / 100)
  const statutory = rupee(pf + esic + professionalTax + tds)
  const net = rupee(gross - penalties - statutory)

  return {
    present,
    half,
    quarter,
    absent,
    lateCount,
    overtimeMinutes,
    paidLeaveDays,
    nonCompliant,
    baseEarned,
    overtimePay,
    incentives,
    increments,
    penalties,
    pf,
    esic,
    professionalTax,
    tds,
    gross,
    net,
    /** Everything the admin needs to re-derive the figure by hand. */
    breakdown: {
      version: 2,
      monthlyCtc: round2(input.monthlyCtc),
      dayBasis,
      divisor,
      daysInMonth,
      countedUpTo: input.today < monthDates[daysInMonth - 1] ? input.today : monthDates[daysInMonth - 1],
      perDay: round2(perDay),
      present,
      half,
      halfFactor,
      quarter,
      quarterFactor,
      paidLeaveDays,
      sundays,
      sundayDates,
      holidays,
      holidayList,
      paidUnits: round2(paidUnits),
      baseEarned,
      overtimeMinutes,
      overtimeRate,
      overtimePay,
      lateCount,
      latePenaltyPerDay,
      latePenalty,
      nonCompliant,
      planningPenaltyPerDay,
      planningPenalty,
      adjPenalty,
      incentives,
      increments,
      pfPercent,
      pf,
      esicPercent,
      esic,
      professionalTax,
      tdsPercent,
      tds,
      statutory,
      gross,
      net,
    },
  }
}
