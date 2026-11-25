import { useState } from 'react'
import { Download, EyeOff } from 'lucide-react'
import { parseComponents, useMySalaryRuns, usePayslipTemplates, useSalaryProfile } from './hooks'
import { rupees } from './money'
import { downloadPayslip, monthName } from './payslipPdf'
import { MASKED, SalaryPasswordModal, SalaryRevealButton, useSalaryVisible } from './salaryLock'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/rbac/profile-context'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'

export function SalaryPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { data: runs = [], isLoading } = useMySalaryRuns()
  const { data: salaryProfile } = useSalaryProfile(user?.id ?? null)
  const { data: templates = [] } = usePayslipTemplates()
  const template = templates.find((t) => t.is_default) ?? templates[0] ?? null
  const toast = useToast()
  const { visible, hide } = useSalaryVisible()
  const [askPassword, setAskPassword] = useState(false)
  const components = parseComponents(salaryProfile?.components)
  const gross = components.filter((c) => c.kind === 'earning').reduce((s, c) => s + c.amount, 0)
  const deductions = components
    .filter((c) => c.kind === 'deduction')
    .reduce((s, c) => s + c.amount, 0)
  const show = (amount: unknown) => (visible ? rupees(amount) : MASKED)

  return (
    <div data-testid="salary-page">
      <PageHeader
        title="My Salary"
        description="Your salary structure and payslips. Download any month's salary slip."
        actions={
          visible ? (
            <Button variant="outline" data-testid="salary-hide" onClick={hide}>
              <EyeOff className="size-4" /> Hide salary
            </Button>
          ) : (
            <SalaryRevealButton onClick={() => setAskPassword(true)} />
          )
        }
      />

      {components.length > 0 && (
        <Card className="mb-6" data-testid="my-salary-breakdown">
          <CardBody>
            <p className="mb-3 text-sm font-medium text-slate-500">Salary structure (monthly)</p>
            <ul className="divide-y divide-slate-100">
              {components.map((c, i) => (
                <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    <Badge tone={c.kind === 'deduction' ? 'red' : 'green'}>{c.kind}</Badge>
                    {c.label}
                  </span>
                  <span className="font-medium text-slate-900">{show(c.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end gap-6 border-t border-slate-200 pt-2 text-sm">
              <span className="text-slate-500">
                Gross <span className="font-semibold text-slate-800">{show(gross)}</span>
              </span>
              <span className="text-slate-500">
                Net{' '}
                <span className="font-semibold text-emerald-700">{show(gross - deductions)}</span>
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      {!isLoading && runs.length === 0 ? (
        <EmptyState title="No payslips yet" testid="salary-empty" />
      ) : (
        <Table data-testid="my-salary-table">
          <Thead>
            <tr>
              <Th>Month</Th>
              <Th>Present</Th>
              <Th>Paid days</Th>
              <Th>Gross</Th>
              <Th>Net</Th>
              <Th className="text-right">Salary slip</Th>
            </tr>
          </Thead>
          <Tbody>
            {runs.map((r) => {
              const b = (r.breakdown ?? {}) as Record<string, unknown>
              return (
                <tr key={r.id} data-testid="salary-run-row">
                  <Td className="font-medium text-slate-900">{monthName(r.period_month)}</Td>
                  <Td>{r.present_days}</Td>
                  <Td>{b.paidUnits != null ? String(b.paidUnits) : '—'}</Td>
                  <Td>{show(r.gross)}</Td>
                  <Td className="font-semibold text-emerald-700">{show(r.net)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="download-my-payslip"
                        onClick={() => {
                          if (!visible) {
                            setAskPassword(true)
                            return
                          }
                          void downloadPayslip({
                            run: r,
                            employee: {
                              name: profile?.full_name || user?.email || 'Employee',
                              code: (profile as { employee_code?: string | null } | null)
                                ?.employee_code,
                            },
                            template,
                          }).catch((err) =>
                            toast.error('Could not create the slip', (err as Error).message),
                          )
                        }}
                      >
                        <Download className="size-4" /> Download slip
                      </Button>
                    </div>
                  </Td>
                </tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {askPassword && <SalaryPasswordModal onClose={() => setAskPassword(false)} />}
    </div>
  )
}
