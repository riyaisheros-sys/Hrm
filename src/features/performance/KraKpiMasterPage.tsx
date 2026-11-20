import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  SYSTEM_METRICS,
  metricLabel,
  useDeleteDesignation,
  useDeletePerformanceItem,
  useDesignationItems,
  useDesignations,
  usePerformanceItems,
  useSaveDesignation,
  useSavePerformanceItem,
  useToggleDesignationItem,
  type Designation,
  type ItemKind,
  type PerformanceItem,
} from './hooks'
import { useDepartments } from '@/features/admin/hierarchy/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/toast-context'

/**
 * KRA / KPI master (client sheet):
 *   1. KRA master and KPI master — the lists everything else picks from.
 *   2. Department → Designation → default KRAs and KPIs.
 * Users then inherit their designation's defaults (editable per user), and
 * appraisals score each of them out of 10.
 */
export function KraKpiMasterPage() {
  const { data: items = [] } = usePerformanceItems()
  return (
    <div data-testid="kra-kpi-master-page">
      <PageHeader
        title="KRA / KPI Master"
        description="Define KRAs and KPIs once, attach them to designations, and they flow to users and appraisals."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <ItemMaster kind="kra" items={items.filter((i) => i.kind === 'kra')} />
        <ItemMaster kind="kpi" items={items.filter((i) => i.kind === 'kpi')} />
      </div>
      <DesignationSection items={items} />
    </div>
  )
}

function ItemMaster({ kind, items }: { kind: ItemKind; items: PerformanceItem[] }) {
  const save = useSavePerformanceItem()
  const remove = useDeletePerformanceItem()
  const toast = useToast()
  const [name, setName] = useState('')
  const [metric, setMetric] = useState('')
  const [editing, setEditing] = useState<PerformanceItem | null>(null)
  const [deleting, setDeleting] = useState<PerformanceItem | null>(null)
  const title = kind === 'kra' ? 'KRA master' : 'KPI master'

  return (
    <Card>
      <CardBody data-testid={`${kind}-master`}>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mb-3 text-xs text-slate-500">
          {kind === 'kra' ? 'Key Result Areas' : 'Key Performance Indicators'}. Pick a system logic
          if the system should score it automatically; leave it on "Manual only" otherwise.
        </p>
        <form
          className="mb-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(
              {
                id: editing?.id,
                kind,
                name,
                system_metric: metric || null,
                description: editing?.description,
                is_active: editing?.is_active,
              },
              {
                onSuccess: () => {
                  toast.success(editing ? `${kind.toUpperCase()} updated` : `${kind.toUpperCase()} added`)
                  setName('')
                  setMetric('')
                  setEditing(null)
                },
                onError: (err) => toast.error('Save failed', (err as Error).message),
              },
            )
          }}
        >
          <div className="min-w-40 flex-1">
            <Label htmlFor={`${kind}-name`} className="text-xs text-slate-500">
              {kind.toUpperCase()} name
            </Label>
            <Input
              id={`${kind}-name`}
              data-testid={`${kind}-name-input`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'kra' ? 'e.g. Client servicing' : 'e.g. Tasks finished on time'}
              required
            />
          </div>
          <div>
            <Label htmlFor={`${kind}-metric`} className="text-xs text-slate-500">
              System logic
            </Label>
            <Select
              id={`${kind}-metric`}
              data-testid={`${kind}-metric-select`}
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-44"
            >
              <option value="">Manual only</option>
              {SYSTEM_METRICS.map((m) => (
                <option key={m.value} value={m.value} title={m.logic}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" data-testid={`${kind}-save`} loading={save.isPending}>
            <Plus className="size-4" /> {editing ? 'Save' : 'Add'}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null)
                setName('')
                setMetric('')
              }}
            >
              Cancel
            </Button>
          )}
        </form>
        {metric && (
          <p className="mb-3 text-xs text-slate-500">
            Logic: {SYSTEM_METRICS.find((m) => m.value === metric)?.logic} → score out of 10.
          </p>
        )}

        {items.length === 0 ? (
          <EmptyState title={`No ${kind.toUpperCase()} defined yet`} testid={`${kind}-empty`} />
        ) : (
          <Table data-testid={`${kind}-table`}>
            <Thead>
              <tr>
                <Th className="w-10">S.No</Th>
                <Th>{kind.toUpperCase()}</Th>
                <Th>System logic</Th>
                <Th>Status</Th>
                <Th className="w-px" />
              </tr>
            </Thead>
            <Tbody>
              {items.map((item, i) => (
                <tr key={item.id} data-testid={`${kind}-row`}>
                  <Td className="text-xs text-slate-400 tabular-nums">{i + 1}</Td>
                  <Td className="font-medium text-slate-900">{item.name}</Td>
                  <Td>
                    {item.system_metric ? (
                      <Badge tone="blue">{metricLabel(item.system_metric)}</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Manual only</span>
                    )}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      aria-label={`Toggle status of ${item.name}`}
                      onClick={() =>
                        save.mutate(
                          {
                            id: item.id,
                            kind,
                            name: item.name,
                            description: item.description,
                            system_metric: item.system_metric,
                            is_active: !item.is_active,
                          },
                          { onError: (err) => toast.error('Save failed', (err as Error).message) },
                        )
                      }
                    >
                      <Badge tone={item.is_active ? 'green' : 'slate'}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label={`Edit ${item.name}`}
                        className="hover:text-brand-600 text-slate-400"
                        onClick={() => {
                          setEditing(item)
                          setName(item.name)
                          setMetric(item.system_metric ?? '')
                        }}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${item.name}`}
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => setDeleting(item)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}

        {deleting && (
          <ConfirmDialog
            title={`Delete ${kind.toUpperCase()}`}
            testid={`${kind}-delete-dialog`}
            confirmLabel="Delete"
            loading={remove.isPending}
            onClose={() => setDeleting(null)}
            message={
              <p>
                Delete <span className="font-semibold text-slate-900">{deleting.name}</span>? It
                will be removed from every designation and user. Appraisals already scored keep
                their record.
              </p>
            }
            onConfirm={() =>
              remove.mutate(deleting.id, {
                onSuccess: () => {
                  toast.success('Deleted')
                  setDeleting(null)
                },
                onError: (err) => toast.error('Delete failed', (err as Error).message),
              })
            }
          />
        )}
      </CardBody>
    </Card>
  )
}

function DesignationSection({ items }: { items: PerformanceItem[] }) {
  const { data: departments = [] } = useDepartments()
  const { data: designations = [] } = useDesignations()
  const { data: defaults = new Map<string, Set<string>>() } = useDesignationItems()
  const save = useSaveDesignation()
  const remove = useDeleteDesignation()
  const toast = useToast()
  const [departmentId, setDepartmentId] = useState('')
  const [name, setName] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [editing, setEditing] = useState<Designation | null>(null)
  const [deleting, setDeleting] = useState<Designation | null>(null)

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments])
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const rows = useMemo(
    () =>
      designations
        .filter((d) => !deptFilter || d.department_id === deptFilter)
        .sort(
          (a, b) =>
            (deptName.get(a.department_id) ?? '').localeCompare(deptName.get(b.department_id) ?? '') ||
            a.name.localeCompare(b.name),
        ),
    [designations, deptFilter, deptName],
  )

  return (
    <Card className="mt-5">
      <CardBody data-testid="designation-section">
        <h2 className="text-sm font-semibold text-slate-900">
          Department → Designation → default KRA / KPI
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Every designation belongs to a department and carries a default set of KRAs and KPIs. A
          user given that designation starts with these and can then be adjusted individually.
        </p>

        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(
              { department_id: departmentId || departments[0]?.id || '', name },
              {
                onSuccess: () => {
                  toast.success('Designation added')
                  setName('')
                },
                onError: (err) => toast.error('Save failed', (err as Error).message),
              },
            )
          }}
        >
          <div>
            <Label htmlFor="desig-dept" className="text-xs text-slate-500">
              Department
            </Label>
            <Select
              id="desig-dept"
              data-testid="designation-department-select"
              value={departmentId || departments[0]?.id || ''}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-52"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-48 flex-1">
            <Label htmlFor="desig-name" className="text-xs text-slate-500">
              Designation
            </Label>
            <Input
              id="desig-name"
              data-testid="designation-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Business Development Executive"
              required
            />
          </div>
          <Button type="submit" data-testid="designation-add" loading={save.isPending}>
            <Plus className="size-4" /> Add designation
          </Button>
          <div className="ml-auto">
            <Label htmlFor="desig-filter" className="text-xs text-slate-500">
              Show
            </Label>
            <Select
              id="desig-filter"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-48"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </form>

        {rows.length === 0 ? (
          <EmptyState title="No designations yet" testid="designations-empty" />
        ) : (
          <Table data-testid="designations-table">
            <Thead>
              <tr>
                <Th className="w-10">S.No</Th>
                <Th>Department</Th>
                <Th>Designation</Th>
                <Th>Default KRA</Th>
                <Th>Default KPI</Th>
                <Th className="w-px" />
              </tr>
            </Thead>
            <Tbody>
              {rows.map((d, i) => {
                const picked = [...(defaults.get(d.id) ?? [])]
                  .map((id) => itemById.get(id))
                  .filter((x): x is PerformanceItem => !!x)
                const chips = (kind: ItemKind) => {
                  const list = picked.filter((p) => p.kind === kind)
                  return list.length === 0 ? (
                    <span className="text-xs text-slate-400">None selected</span>
                  ) : (
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {list.map((p) => (
                        <span
                          key={p.id}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                        >
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )
                }
                return (
                  <tr key={d.id} data-testid="designation-row">
                    <Td className="text-xs text-slate-400 tabular-nums">{i + 1}</Td>
                    <Td>{deptName.get(d.department_id) ?? '—'}</Td>
                    <Td className="font-medium text-slate-900">{d.name}</Td>
                    <Td>{chips('kra')}</Td>
                    <Td>{chips('kpi')}</Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="designation-edit-defaults"
                          onClick={() => setEditing(d)}
                        >
                          Select KRA / KPI
                        </Button>
                        <button
                          type="button"
                          aria-label={`Delete ${d.name}`}
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => setDeleting(d)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </Tbody>
          </Table>
        )}

        {editing && (
          <DesignationDefaultsModal
            designation={editing}
            departmentName={deptName.get(editing.department_id) ?? ''}
            items={items}
            selected={defaults.get(editing.id) ?? new Set<string>()}
            onClose={() => setEditing(null)}
          />
        )}
        {deleting && (
          <ConfirmDialog
            title="Delete designation"
            testid="designation-delete-dialog"
            confirmLabel="Delete"
            loading={remove.isPending}
            onClose={() => setDeleting(null)}
            message={
              <p>
                Delete <span className="font-semibold text-slate-900">{deleting.name}</span>? Users
                holding it keep their KRA / KPI list but lose the designation.
              </p>
            }
            onConfirm={() =>
              remove.mutate(deleting.id, {
                onSuccess: () => {
                  toast.success('Designation deleted')
                  setDeleting(null)
                },
                onError: (err) => toast.error('Delete failed', (err as Error).message),
              })
            }
          />
        )}
      </CardBody>
    </Card>
  )
}

function DesignationDefaultsModal({
  designation,
  departmentName,
  items,
  selected,
  onClose,
}: {
  designation: Designation
  departmentName: string
  items: PerformanceItem[]
  selected: Set<string>
  onClose: () => void
}) {
  const toggle = useToggleDesignationItem()
  const toast = useToast()
  const column = (kind: ItemKind) => {
    const list = items.filter((i) => i.kind === kind && i.is_active)
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {kind.toUpperCase()} — selection from master
        </p>
        {list.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing in the {kind.toUpperCase()} master yet.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {list.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="accent-brand-600 mt-0.5"
                    data-testid={`default-item-${item.name}`}
                    checked={selected.has(item.id)}
                    onChange={(e) =>
                      toggle.mutate(
                        { designationId: designation.id, itemId: item.id, on: e.target.checked },
                        { onError: (err) => toast.error('Save failed', (err as Error).message) },
                      )
                    }
                  />
                  <span className="text-sm text-slate-700">
                    {item.name}
                    {item.system_metric && (
                      <span className="ml-1 text-xs text-slate-400">
                        · system: {metricLabel(item.system_metric)}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`${departmentName} · ${designation.name}`}
      testid="designation-defaults-modal"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Tick the KRAs and KPIs every {designation.name} should start with. Changes save as you
          tick.
        </p>
        {column('kra')}
        {column('kpi')}
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}
