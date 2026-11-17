import { employeeNav } from '@/components/layout/AppShell'
import { EMPLOYEE_WIDGET_CATALOG } from '@/features/dashboard/widget-catalog'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { useToast } from '@/components/ui/toast-context'
import {
  useEmployeeDashboardPolicy,
  useEmployeeSidebarPolicy,
  useSetEmployeeDashboardItem,
  useSetEmployeeSidebarItem,
} from './hooks'

/**
 * Admin control for what the employee view shows. Each toggle hides or shows
 * an item across every employee in the org. Per-user layout (order, personal
 * hide) still applies on top — this is an org-wide gate.
 */
export function EmployeePanelPage() {
  const { data: sidebarPolicy = new Map<string, boolean>(), isLoading: loadingSidebar } =
    useEmployeeSidebarPolicy()
  const { data: dashPolicy = new Map<string, boolean>(), isLoading: loadingDash } =
    useEmployeeDashboardPolicy()
  const setSidebar = useSetEmployeeSidebarItem()
  const setDash = useSetEmployeeDashboardItem()
  const toast = useToast()

  const sidebarItems = [...employeeNav].sort((a, b) => a.label.localeCompare(b.label))
  const widgetGroups = EMPLOYEE_WIDGET_CATALOG.reduce<Record<string, typeof EMPLOYEE_WIDGET_CATALOG>>(
    (acc, w) => {
      ;(acc[w.group] ??= []).push(w)
      return acc
    },
    {},
  )

  return (
    <div data-testid="employee-panel-page">
      <PageHeader
        title="Employee panel"
        description="Toggle what every employee sees in their entries (side panel) and in their dashboard / reports. Hidden items disappear for all employees immediately."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Employee entries</h2>
            <p className="mb-3 text-xs text-slate-500">
              Each item visible in the employee view can be toggled off. Employees whose role lacks
              the permission for a page still won't see it regardless.
            </p>
            {loadingSidebar ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="sidebar-policy-list">
                {sidebarItems.map((item) => {
                  const visible = sidebarPolicy.get(item.testid) ?? true
                  return (
                    <li
                      key={item.testid}
                      className="flex items-center justify-between py-2"
                      data-testid={`sidebar-policy-${item.testid}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{item.label}</p>
                        <p className="text-xs text-slate-400">{item.to}</p>
                      </div>
                      <PolicyToggle
                        on={visible}
                        testid={`sidebar-toggle-${item.testid}`}
                        onChange={(next) =>
                          setSidebar.mutate(
                            { itemKey: item.testid, visible: next },
                            {
                              onError: (err) =>
                                toast.error('Save failed', (err as Error).message),
                            },
                          )
                        }
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Employee dashboard / reports</h2>
            <p className="mb-3 text-xs text-slate-500">
              Each dashboard widget available in the employee view. Hidden widgets disappear from
              everyone's dashboard.
            </p>
            {loadingDash ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="space-y-4" data-testid="dashboard-policy-list">
                {Object.entries(widgetGroups).map(([group, items]) => (
                  <div key={group}>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group}
                    </h3>
                    <ul className="divide-y divide-slate-100">
                      {items.map((w) => {
                        const visible = dashPolicy.get(w.id) ?? true
                        return (
                          <li
                            key={w.id}
                            className="flex items-center justify-between py-1.5"
                            data-testid={`dashboard-policy-${w.id}`}
                          >
                            <p className="text-sm text-slate-800">{w.label}</p>
                            <PolicyToggle
                              on={visible}
                              testid={`dashboard-toggle-${w.id}`}
                              onChange={(next) =>
                                setDash.mutate(
                                  { widgetId: w.id, visible: next },
                                  {
                                    onError: (err) =>
                                      toast.error('Save failed', (err as Error).message),
                                  },
                                )
                              }
                            />
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function PolicyToggle({
  on,
  onChange,
  testid,
}: {
  on: boolean
  onChange: (next: boolean) => void
  testid: string
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition ' +
        (on ? 'bg-brand-500' : 'bg-slate-200')
      }
    >
      <span
        className={
          'inline-block size-4 transform rounded-full bg-white shadow transition ' +
          (on ? 'translate-x-4' : 'translate-x-0.5')
        }
      />
    </button>
  )
}
