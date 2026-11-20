import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SalaryCalculation } from './SalaryCalculation'
import { computePayroll, datesOfMonth } from '../../../supabase/functions/calculate-salary/calc'
import type { SalaryRun } from './hooks'

const isSunday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0

describe('SalaryCalculation', () => {
  it('shows the per-day rate, paid days and net the engine produced', () => {
    const worked = datesOfMonth('2026-11')
      .filter((d) => !isSunday(d))
      .slice(0, 13)
    const calc = computePayroll({
      month: '2026-11',
      today: '2026-11-20',
      monthlyCtc: 18000,
      policy: {
        working_days_per_month: 26,
        half_day_factor: 0.5,
        quarter_day_factor: 0.25,
        paid_leave_paid: true,
        late_penalty_per_day: 0,
        overtime_rate_per_hour: 0,
        planning_penalty_per_day: 0,
      },
      days: worked.map((work_date) => ({
        work_date,
        status: 'full_day',
        is_late: false,
        overtime_minutes: 0,
      })),
      paidLeaveDays: 1,
      holidays: [],
      compliantDates: worked,
      adjustments: [],
    })
    render(
      <SalaryCalculation
        run={{ breakdown: calc.breakdown, base_earned: calc.baseEarned } as unknown as SalaryRun}
      />,
    )
    expect(screen.getByTestId('calc-per-day').textContent).toContain('18,000.00 ÷ 30 = 600.00')
    expect(screen.getByTestId('calc-paid-days').textContent).toBe('17')
    expect(screen.getByTestId('calc-base').textContent).toBe('10,200.00')
    expect(screen.getByTestId('calc-net').textContent).toBe('10,200.00')
  })

  it('tells the admin to recompute a payslip stored with the old formula', () => {
    render(
      <SalaryCalculation
        run={
          {
            breakdown: { perDay: 692.31, paidUnits: 14 },
            base_earned: 9692.31,
          } as unknown as SalaryRun
        }
      />,
    )
    expect(screen.getByTestId('salary-calculation').textContent).toContain('Click Compute again')
  })
})
