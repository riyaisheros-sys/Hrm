import { describe, expect, it } from 'vitest'
import {
  computePayroll,
  datesOfMonth,
  type PayrollInput,
} from '../../../supabase/functions/calculate-salary/calc'

const policy = {
  working_days_per_month: 26,
  half_day_factor: 0.5,
  quarter_day_factor: 0.25,
  paid_leave_paid: true,
  late_penalty_per_day: 0,
  overtime_rate_per_hour: 0,
  planning_penalty_per_day: 0,
}

const isSunday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0
const NOV = datesOfMonth('2026-11') // 30 days, Sundays on 1, 8, 15, 22, 29
const novWorkingDays = NOV.filter((d) => !isSunday(d)) // 25

const day = (work_date: string, status = 'full_day') => ({
  work_date,
  status,
  is_late: false,
  overtime_minutes: 0,
})

function input(over: Partial<PayrollInput>): PayrollInput {
  return {
    month: '2026-11',
    today: '2026-11-30',
    monthlyCtc: 18000,
    policy,
    days: [],
    paidLeaveDays: 0,
    holidays: [],
    compliantDates: NOV,
    adjustments: [],
    joinedOn: null,
    ...over,
  }
}

describe('computePayroll', () => {
  it('pays a full month in full: working days + Sundays = calendar days', () => {
    const r = computePayroll(input({ days: novWorkingDays.map((d) => day(d)) }))
    expect(r.breakdown.sundays).toBe(5)
    expect(r.breakdown.paidUnits).toBe(30)
    expect(r.breakdown.perDay).toBe(600)
    expect(r.gross).toBe(18000)
  })

  it('mid-month: 13 present + 1 paid leave + the 3 Sundays so far', () => {
    const r = computePayroll(
      input({
        today: '2026-11-20',
        days: novWorkingDays.slice(0, 13).map((d) => day(d)),
        paidLeaveDays: 1,
      }),
    )
    expect(r.breakdown.sundayDates).toEqual(['2026-11-01', '2026-11-08', '2026-11-15'])
    expect(r.breakdown.paidUnits).toBe(17)
    expect(r.baseEarned).toBe(10200)
  })

  it('keeps the old working-day formula when the policy switch is off', () => {
    const r = computePayroll(
      input({
        today: '2026-11-20',
        policy: { ...policy, pay_sundays_holidays: false },
        days: novWorkingDays.slice(0, 13).map((d) => day(d)),
        paidLeaveDays: 1,
      }),
    )
    expect(r.breakdown.dayBasis).toBe('working_days')
    expect(r.breakdown.sundays).toBe(0)
    expect(r.baseEarned).toBe(9692) // 18000 / 26 * 14 = 9692.31, paid in whole rupees
  })

  it('pays an unworked weekday holiday once; ignores a holiday on a Sunday', () => {
    const holidays = [
      { holiday_date: '2026-11-10', name: 'Diwali' }, // Tuesday
      { holiday_date: '2026-11-15', name: 'Sunday festival' }, // already a Sunday
    ]
    const days = novWorkingDays.filter((d) => d !== '2026-11-10').map((d) => day(d))
    const r = computePayroll(input({ days, holidays }))
    expect(r.breakdown.holidayList).toEqual([{ date: '2026-11-10', name: 'Diwali' }])
    expect(r.breakdown.sundays).toBe(5)
    expect(r.gross).toBe(18000)
  })

  it('does not double-pay a Sunday or holiday that was actually worked', () => {
    const days = [...novWorkingDays, '2026-11-08'].map((d) => day(d))
    const r = computePayroll(
      input({ days, holidays: [{ holiday_date: '2026-11-10', name: 'Diwali' }] }),
    )
    expect(r.breakdown.sundays).toBe(4)
    expect(r.breakdown.holidays).toBe(0)
    expect(r.breakdown.paidUnits).toBe(30) // 26 worked + 4 Sundays
  })

  it('pays no off days to someone with no attendance and no paid leave', () => {
    const r = computePayroll(input({}))
    expect(r.breakdown.paidUnits).toBe(0)
    expect(r.gross).toBe(0)
  })

  it('does not pay Sundays from before the employee was on record', () => {
    const days = novWorkingDays.filter((d) => d >= '2026-11-16').map((d) => day(d))
    const r = computePayroll(input({ days, joinedOn: '2026-11-16' }))
    expect(r.breakdown.sundayDates).toEqual(['2026-11-22', '2026-11-29'])
  })

  it('applies half / quarter factors, penalties and statutory deductions', () => {
    const r = computePayroll(
      input({
        policy: {
          ...policy,
          pay_sundays_holidays: false,
          late_penalty_per_day: 50,
          planning_penalty_per_day: 100,
          pf_percent: 12,
        },
        monthlyCtc: 26000,
        days: [
          day('2026-11-02'),
          day('2026-11-03', 'half_day'),
          day('2026-11-04', 'quarter_day'),
          { ...day('2026-11-05'), is_late: true },
        ],
        compliantDates: ['2026-11-02', '2026-11-03', '2026-11-04'],
        adjustments: [{ kind: 'incentive', amount: 500 }],
      }),
    )
    expect(r.breakdown.paidUnits).toBe(2.75)
    expect(r.baseEarned).toBe(2750)
    expect(r.gross).toBe(3250)
    expect(r.penalties).toBe(150) // 1 late × 50 + 1 planning gap × 100
    expect(r.pf).toBe(330)
    expect(r.net).toBe(2770)
  })

  it('pays every amount in whole rupees and the payslip still adds up', () => {
    // 31-day month: 20,000 ÷ 31 = 645.16 a day, which never lands on a rupee.
    const worked = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']
    const r = computePayroll({
      month: '2026-10',
      today: '2026-10-07',
      monthlyCtc: 20000,
      policy: { ...policy, pf_percent: 12, tds_percent: 1.5, overtime_rate_per_hour: 95 },
      days: worked.map((work_date) => ({
        work_date,
        status: 'full_day',
        is_late: false,
        overtime_minutes: 7,
      })),
      paidLeaveDays: 0,
      holidays: [],
      compliantDates: worked,
      adjustments: [{ kind: 'incentive', amount: 250.75 }],
    })
    for (const amount of [r.baseEarned, r.overtimePay, r.incentives, r.pf, r.tds, r.gross, r.net]) {
      expect(Number.isInteger(amount)).toBe(true)
    }
    expect(r.baseEarned).toBe(3871) // 20000 × 6 paid days (5 worked + 1 Sunday) ÷ 31 = 3870.97
    expect(r.gross).toBe(r.baseEarned + r.overtimePay + r.incentives + r.increments)
    expect(r.net).toBe(r.gross - r.penalties - r.pf - r.esic - r.professionalTax - r.tds)
  })
})
