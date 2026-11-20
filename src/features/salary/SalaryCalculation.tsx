import { useSalaryPolicy, useUpdateSalaryPolicy, type SalaryRun } from './hooks'
import { useToast } from '@/components/ui/toast-context'
import { formatDate } from '@/lib/format'

const money = (n: unknown) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n = (v: unknown) => Number(v ?? 0) || 0

/**
 * Step-by-step working behind a computed payslip, so the admin can re-derive
 * every figure by hand: per-day rate, each kind of paid day, earnings, then
 * each deduction. Reads the `breakdown` the calculate-salary function stores
 * with the run — nothing is recomputed in the browser.
 */
export function SalaryCalculation({ run }: { run: SalaryRun }) {
  const b = (run.breakdown ?? {}) as Record<string, unknown>
  const isV2 = n(b.version) >= 2

  if (!isV2) {
    // Runs computed before the Sundays / holidays update only stored totals.
    return (
      <div
        data-testid="salary-calculation"
        className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
      >
        <p className="font-medium text-slate-800">How this salary is calculated</p>
        <p className="mt-1 text-slate-600">
          Per day {money(b.perDay)} × {n(b.paidUnits)} paid days = base earned{' '}
          {money(run.base_earned)}.
        </p>
        <p className="mt-1 text-xs text-amber-700">
          This payslip was computed with the earlier formula (Sundays and holidays not counted).
          Click Compute again to see the full step-by-step working.
        </p>
      </div>
    )
  }

  const calendar = b.dayBasis === 'calendar'
  const sundayDates = Array.isArray(b.sundayDates) ? (b.sundayDates as string[]) : []
  const holidayList = Array.isArray(b.holidayList)
    ? (b.holidayList as Array<{ date: string; name: string }>)
    : []

  const paidDayLines: Array<{ label: string; detail: string; units: number }> = [
    { label: 'Present days', detail: `${n(b.present)} × 1`, units: n(b.present) },
    {
      label: 'Half days',
      detail: `${n(b.half)} × ${n(b.halfFactor)}`,
      units: n(b.half) * n(b.halfFactor),
    },
    {
      label: 'Quarter days',
      detail: `${n(b.quarter)} × ${n(b.quarterFactor)}`,
      units: n(b.quarter) * n(b.quarterFactor),
    },
    { label: 'Paid leave', detail: `${n(b.paidLeaveDays)} × 1`, units: n(b.paidLeaveDays) },
    {
      label: 'Sundays',
      detail: sundayDates.length
        ? sundayDates.map((d) => formatDate(d)).join(', ')
        : calendar
          ? 'none counted'
          : 'not paid (switch is off)',
      units: n(b.sundays),
    },
    {
      label: 'Holidays',
      detail: holidayList.length
        ? holidayList.map((h) => `${h.name} (${formatDate(h.date)})`).join(', ')
        : calendar
          ? 'none in this period'
          : 'not paid (switch is off)',
      units: n(b.holidays),
    },
  ]

  return (
    <div
      data-testid="salary-calculation"
      className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
    >
      <p className="font-medium text-slate-800">How this salary is calculated</p>

      <Step no={1} title="Per-day rate">
        <Row
          label={
            calendar
              ? `Monthly salary ÷ ${n(b.divisor)} calendar days`
              : `Monthly salary ÷ ${n(b.divisor)} working days`
          }
          value={`${money(b.monthlyCtc)} ÷ ${n(b.divisor)} = ${money(b.perDay)}`}
          testid="calc-per-day"
        />
      </Step>

      <Step
        no={2}
        title={`Paid days${b.countedUpTo ? ` (counted up to ${formatDate(String(b.countedUpTo))})` : ''}`}
      >
        {paidDayLines.map((line) => (
          <Row
            key={line.label}
            label={line.label}
            hint={line.detail}
            value={String(Math.round(line.units * 100) / 100)}
          />
        ))}
        <Row label="Total paid days" value={String(n(b.paidUnits))} strong testid="calc-paid-days" />
      </Step>

      <Step no={3} title="Earnings">
        <Row
          label="Base earned"
          hint={`${money(b.perDay)} × ${n(b.paidUnits)} paid days`}
          value={money(b.baseEarned)}
          testid="calc-base"
        />
        <Row
          label="Overtime"
          hint={`${n(b.overtimeMinutes)} min × ${money(b.overtimeRate)} per hour`}
          value={money(b.overtimePay)}
        />
        <Row label="Incentives" value={money(b.incentives)} />
        <Row label="Increments" value={money(b.increments)} />
        <Row label="Gross" value={money(b.gross)} strong />
      </Step>

      <Step no={4} title="Deductions">
        <Row
          label="Late penalty"
          hint={`${n(b.lateCount)} late × ${money(b.latePenaltyPerDay)}`}
          value={money(b.latePenalty)}
        />
        <Row
          label="Planning penalty"
          hint={`${n(b.nonCompliant)} gap day(s) × ${money(b.planningPenaltyPerDay)}`}
          value={money(b.planningPenalty)}
        />
        <Row label="Other penalties" value={money(b.adjPenalty)} />
        <Row label="PF" hint={`${n(b.pfPercent)}% of base earned`} value={money(b.pf)} />
        <Row label="ESIC" hint={`${n(b.esicPercent)}% of gross`} value={money(b.esic)} />
        <Row label="Professional tax" value={money(b.professionalTax)} />
        <Row label="TDS" hint={`${n(b.tdsPercent)}% of gross`} value={money(b.tds)} />
      </Step>

      <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2">
        <span className="font-semibold text-emerald-800">Net = Gross − Deductions</span>
        <span className="text-base font-bold text-emerald-800" data-testid="calc-net">
          {money(b.net)}
        </span>
      </div>
    </div>
  )
}

function Step({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {no}. {title}
      </p>
      <div className="rounded-md border border-slate-200 bg-white px-3 py-1">{children}</div>
    </div>
  )
}

function Row({
  label,
  hint,
  value,
  strong,
  testid,
}: {
  label: string
  hint?: string
  value: string
  strong?: boolean
  testid?: string
}) {
  return (
    <div
      className={
        'flex items-start justify-between gap-4 border-b border-slate-100 py-1 last:border-b-0 ' +
        (strong ? 'font-semibold text-slate-900' : 'text-slate-700')
      }
    >
      <span>
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>}
      </span>
      <span className="whitespace-nowrap tabular-nums" data-testid={testid}>
        {value}
      </span>
    </div>
  )
}

/**
 * Org-wide switch for paying Sundays and holidays. Changing it only affects
 * payslips computed afterwards — existing runs keep their stored figures
 * until Compute is clicked again.
 */
export function SundayHolidaySwitch({ canManage }: { canManage: boolean }) {
  const { data: policy } = useSalaryPolicy()
  const update = useUpdateSalaryPolicy()
  const toast = useToast()
  if (!policy) return null
  // Column may not exist yet on a database that has not run the migration.
  const supported = 'pay_sundays_holidays' in policy
  const on = supported ? policy.pay_sundays_holidays !== false : false

  return (
    <label
      className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      data-testid="sunday-holiday-switch"
    >
      <input
        type="checkbox"
        className="accent-brand-600 mt-0.5"
        checked={on}
        disabled={!canManage || !supported || update.isPending}
        onChange={(e) =>
          update.mutate(
            { pay_sundays_holidays: e.target.checked },
            {
              onSuccess: () =>
                toast.success('Salary policy updated', 'Click Compute to apply it to a payslip.'),
              onError: (err) => toast.error('Could not update policy', (err as Error).message),
            },
          )
        }
      />
      <span>
        <span className="font-medium text-slate-800">Pay Sundays and holidays</span>
        <span className="block text-xs text-slate-500">
          {on
            ? 'On — a day is worth salary ÷ calendar days; Sundays, holidays and paid leave count as paid days.'
            : supported
              ? `Off — a day is worth salary ÷ ${policy.working_days_per_month} working days; Sundays and holidays are not paid.`
              : 'Not available yet — the database update for this option has not been applied.'}
        </span>
      </span>
    </label>
  )
}
