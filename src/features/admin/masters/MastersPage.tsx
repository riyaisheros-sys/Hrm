import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Download,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import {
  useDeleteMasterItem,
  useMasterAudit,
  useMasterItems,
  useReorderMasterItems,
  useSaveMasterItem,
  type MasterItem,
  type MasterKind,
} from './hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { useToast } from '@/components/ui/toast-context'
import { formatDateTime } from '@/lib/format'
import { ColumnChips } from '@/components/ui/ColumnChips'
import { useColumnConfig } from '@/lib/useColumnConfig'

/**
 * Every master lives in exactly one module. The UI groups them by module so
 * admins can see which categories belong to which part of the product —
 * client ask: "Master group with all the category kon kisse related".
 *
 * `simple` masters are edited inline with the common CRUD widget below.
 * `linked` masters open their specialized admin page (cycles, holidays, etc.).
 */
type SimpleMaster = {
  value: MasterKind
  label: string
  module: string
  kind: 'simple'
}
type LinkedMaster = {
  label: string
  module: string
  kind: 'linked'
  href: string
  note?: string
}

const KINDS: Array<SimpleMaster | LinkedMaster> = [
  // People
  {
    kind: 'linked',
    module: 'People',
    label: 'Users / Employees',
    href: '/admin/users',
    note: 'Add, edit, roles, KRA / KPI, leave quota',
  },
  { kind: 'linked', module: 'People', label: 'Companies', href: '/admin/hierarchy' },
  { kind: 'linked', module: 'People', label: 'Departments', href: '/admin/hierarchy' },
  { kind: 'linked', module: 'People', label: 'Teams', href: '/admin/hierarchy' },
  { kind: 'linked', module: 'People', label: 'Organization Roles & Access', href: '/admin/roles' },
  {
    kind: 'linked',
    module: 'People',
    label: 'Employee Panel',
    href: '/admin/employee-panel',
    note: 'What employees see in entries & dashboard',
  },
  { kind: 'linked', module: 'People', label: 'Lifecycle', href: '/admin/lifecycle' },

  // Tasks
  { kind: 'simple', value: 'task_categories', label: 'Task Groups', module: 'Tasks' },
  { kind: 'linked', module: 'Tasks', label: 'Tasks', href: '/tasks' },
  {
    kind: 'linked',
    module: 'Tasks',
    label: 'Task Statuses',
    href: '/tasks',
    note: 'Open Tasks → Statuses dialog',
  },
  {
    kind: 'linked',
    module: 'Tasks',
    label: 'Task capacity',
    href: '/tasks',
    note: 'Open Tasks → Statuses dialog',
  },

  // Attendance
  { kind: 'linked', module: 'Attendance', label: 'Attendance Monitor', href: '/admin/attendance' },
  {
    kind: 'linked',
    module: 'Attendance',
    label: 'Locations (geo-fence)',
    href: '/admin/attendance',
    note: 'Attendance Monitor → Locations',
  },
  {
    kind: 'linked',
    module: 'Attendance',
    label: 'Attendance Settings',
    href: '/admin/attendance-settings',
    note: 'Working hours, lunch, day thresholds, grace, geo-fence',
  },
  { kind: 'linked', module: 'Attendance', label: 'Monitoring', href: '/admin/monitoring' },

  // Planning
  {
    kind: 'linked',
    module: 'Planning',
    label: 'Planning monitor',
    href: '/admin/planning',
    note: 'Slots, punch locks and admin unlocks',
  },
  {
    kind: 'linked',
    module: 'Planning',
    label: 'Planning config',
    href: '/admin/planning',
    note: 'Slot interval and working window',
  },

  // Leave
  { kind: 'simple', value: 'leave_types', label: 'Leave Types', module: 'Leave' },
  { kind: 'linked', module: 'Leave', label: 'Leave approvals', href: '/admin/leave' },
  { kind: 'linked', module: 'Leave', label: 'Holidays', href: '/admin/leave' },

  // Performance / Growth
  { kind: 'simple', value: 'appraisal_types', label: 'Appraisal Types', module: 'Performance' },
  { kind: 'linked', module: 'Performance', label: 'KRA master', href: '/admin/kra-kpi' },
  { kind: 'linked', module: 'Performance', label: 'KPI master', href: '/admin/kra-kpi' },
  {
    kind: 'linked',
    module: 'Performance',
    label: 'Designations & default KRA / KPI',
    href: '/admin/kra-kpi',
  },
  { kind: 'linked', module: 'Performance', label: 'Appraisal Cycles', href: '/admin/appraisal' },
  { kind: 'linked', module: 'Performance', label: 'Appraisals', href: '/admin/appraisal' },

  // Documents / Policies
  { kind: 'simple', value: 'document_types', label: 'Document Types', module: 'Documents' },
  { kind: 'linked', module: 'Documents', label: 'Doc Vault', href: '/admin/documents' },
  { kind: 'simple', value: 'policy_categories', label: 'Policy Categories', module: 'Policies' },
  { kind: 'linked', module: 'Policies', label: 'Policies', href: '/admin/policies' },

  // Helpdesk
  {
    kind: 'simple',
    value: 'helpdesk_categories',
    label: 'Helpdesk Categories',
    module: 'Helpdesk',
  },
  { kind: 'linked', module: 'Helpdesk', label: 'Helpdesk tickets', href: '/helpdesk' },

  // Compensation
  { kind: 'linked', module: 'Compensation', label: 'Salary', href: '/admin/salary' },
  { kind: 'linked', module: 'Compensation', label: 'Payslip Templates', href: '/admin/salary' },
  { kind: 'linked', module: 'Compensation', label: 'Salary policy', href: '/admin/salary' },

  // Workflow / Processes
  { kind: 'linked', module: 'Workflow', label: 'Workflow Definitions', href: '/admin/workflows' },
  {
    kind: 'linked',
    module: 'Workflow',
    label: 'Communication Templates',
    href: '/admin/onboarding',
  },

  // Training
  { kind: 'linked', module: 'Training', label: 'Training Modules', href: '/admin/training' },

  // Recruitment
  { kind: 'linked', module: 'Recruitment', label: 'Job Openings', href: '/admin/recruitment' },
  { kind: 'linked', module: 'Recruitment', label: 'Candidates', href: '/admin/recruitment' },

  // Assets
  {
    kind: 'linked',
    module: 'Assets',
    label: 'Assets',
    href: '/admin/assets',
    note: 'Inventory and assignment history',
  },

  // Engagement
  { kind: 'linked', module: 'Engagement', label: 'Recognition', href: '/recognition' },
  { kind: 'linked', module: 'Engagement', label: 'Visitors & Meetings', href: '/admin/visitors' },
  { kind: 'linked', module: 'Engagement', label: 'Notice Board', href: '/announcements' },

  // Reports & system
  { kind: 'linked', module: 'Reports & System', label: 'Reports', href: '/admin/reports' },
  { kind: 'linked', module: 'Reports & System', label: 'Audit Log', href: '/admin/audit' },
  { kind: 'linked', module: 'Reports & System', label: 'Dashboard', href: '/' },
]

const SIMPLE_KINDS = KINDS.filter((k): k is SimpleMaster => k.kind === 'simple')

// Preserve the module order in which they first appear above.
const MODULES: string[] = []
for (const k of KINDS) if (!MODULES.includes(k.module)) MODULES.push(k.module)

/**
 * Every change on this page goes through one confirmation popup (client ask:
 * "save and cancel warning in the centralised master area"). `run` applies the
 * change on Save; `onCancel` undoes any optimistic UI (e.g. a typed sequence
 * number); `discard` adds a third button for the unsaved-changes case.
 */
interface PendingChange {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  run: () => Promise<unknown>
  onCancel?: () => void
  discard?: () => void
}

const MASTER_COLS = [
  { id: 'sequence', label: 'Sequence' },
  { id: 'name', label: 'Name' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: 'Actions' },
]

export function MastersPage() {
  const [kind, setKind] = useState<MasterKind>('task_categories')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<MasterItem | null>(null)
  const [name, setName] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // Display headings: show / hide, re-order and colour the table headings.
  const colConfig = useColumnConfig('masters', MASTER_COLS)
  const importRef = useRef<HTMLInputElement>(null)
  const { data: items = [] } = useMasterItems(kind)
  const { data: audit = [] } = useMasterAudit()
  const save = useSaveMasterItem(kind)
  const remove = useDeleteMasterItem(kind)
  const reorder = useReorderMasterItems(kind)
  const toast = useToast()
  const filtered = useMemo(
    () => items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  )
  const kindLabel = SIMPLE_KINDS.find((k) => k.value === kind)?.label ?? 'this master'
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [applying, setApplying] = useState(false)
  const dirty = editing ? name.trim() !== editing.name : name.trim() !== ''

  async function confirmPending() {
    if (!pending) return
    setApplying(true)
    try {
      await pending.run()
    } catch (error) {
      pending.onCancel?.()
      toast.error('Save failed', (error as Error).message)
    } finally {
      setApplying(false)
      setPending(null)
    }
  }

  function cancelPending() {
    pending?.onCancel?.()
    setPending(null)
  }

  function saveNamePayload() {
    return {
      id: editing?.id,
      code: editing?.code,
      name,
      is_active: editing?.is_active ?? true,
      sort_order: editing?.sort_order ?? items.length + 1,
    }
  }

  function applyKind(next: MasterKind) {
    setKind(next)
    setEditing(null)
    setName('')
  }

  /** Switching masters with a half-typed name asks before throwing it away. */
  function switchKind(next: MasterKind) {
    if (next === kind) return
    if (!dirty) {
      applyKind(next)
      return
    }
    setPending({
      title: 'Unsaved changes',
      message: (
        <p>
          You have an unsaved {editing ? 'edit' : 'new entry'}{' '}
          <span className="font-semibold text-slate-900">{name.trim()}</span> in {kindLabel}. Save
          it before switching?
        </p>
      ),
      confirmLabel: 'Save',
      run: async () => {
        await save.mutateAsync(saveNamePayload())
        toast.success(editing ? 'Master updated' : 'Master added')
        applyKind(next)
      },
      discard: () => applyKind(next),
    })
  }

  function downloadBackup() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, kind, exportedAt: new Date().toISOString(), items }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${kind}-backup.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  /** Validate the backup file first, then ask before writing anything. */
  async function stageRestore(file: File) {
    const parsed = JSON.parse(await file.text()) as {
      version?: number
      kind?: MasterKind
      items?: MasterItem[]
    }
    if (!Array.isArray(parsed.items)) throw new Error('Invalid backup file')
    if (parsed.kind && parsed.kind !== kind) {
      throw new Error(`This is a ${parsed.kind} backup. Select that master before restoring it.`)
    }
    for (const item of parsed.items) {
      if (!item.name?.trim()) throw new Error('Every restored item must have a name')
    }
    const incoming = parsed.items
    const existingByName = new Map(items.map((item) => [item.name.trim().toLowerCase(), item]))
    const updates = incoming.filter((item) =>
      existingByName.has(item.name.trim().toLowerCase()),
    ).length
    setPending({
      title: 'Restore master data',
      message: (
        <p>
          Restore <span className="font-semibold text-slate-900">{incoming.length}</span> item
          {incoming.length === 1 ? '' : 's'} into {kindLabel}? {updates} existing will be updated
          and {incoming.length - updates} added.
        </p>
      ),
      confirmLabel: 'Save',
      run: async () => {
        for (const item of incoming) {
          const existing = existingByName.get(item.name.trim().toLowerCase())
          await save.mutateAsync({
            id: existing?.id,
            name: item.name,
            code: existing?.code ?? item.code,
            is_active: item.is_active,
            sort_order: item.sort_order,
          })
        }
        toast.success('Master data restored')
      },
    })
  }

  return (
    <div data-testid="masters-page">
      <PageHeader
        title="Centralized Masters"
        description="Add, edit, delete, search, order, activate, import, export and audit master data from one place."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadBackup}>
              <Download className="size-4" /> Export / Backup
            </Button>
            <Button variant="outline" onClick={() => importRef.current?.click()}>
              <Upload className="size-4" /> Import / Restore
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  await stageRestore(file)
                } catch (error) {
                  toast.error('Restore failed', (error as Error).message)
                }
                event.target.value = ''
              }}
            />
          </div>
        }
      />

      <div
        data-testid="master-module-map"
        className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3"
      >
        {MODULES.map((mod) => {
          const children = KINDS.filter((k) => k.module === mod)
          return (
            <div
              key={mod}
              data-testid={`master-module-${mod.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <div className="mb-1 font-semibold tracking-wide text-slate-500 uppercase">{mod}</div>
              <ul className="space-y-1">
                {children.map((child) =>
                  child.kind === 'simple' ? (
                    <li key={child.value}>
                      <button
                        type="button"
                        data-testid={`master-pill-${child.value}`}
                        onClick={() => switchKind(child.value)}
                        className={
                          'w-full rounded-md border px-2 py-1 text-left ' +
                          (kind === child.value
                            ? 'border-brand-400 bg-brand-100 text-brand-800'
                            : 'hover:border-brand-300 hover:text-brand-700 border-slate-200 bg-white text-slate-700')
                        }
                      >
                        <span className="font-medium">{child.label}</span>
                        <span className="float-right text-slate-400">edit inline ↓</span>
                      </button>
                    </li>
                  ) : (
                    <li key={`${mod}-${child.label}`}>
                      <Link
                        to={child.href}
                        data-testid={`master-link-${child.label.toLowerCase().replace(/\s+/g, '-')}`}
                        className="hover:border-brand-300 hover:text-brand-700 block w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700"
                      >
                        <span className="font-medium">{child.label}</span>
                        <span className="float-right text-slate-400">open manager →</span>
                        {child.note && (
                          <div className="text-[10px] text-slate-400">{child.note}</div>
                        )}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[240px_1fr]">
        <Select
          data-testid="master-kind-select"
          value={kind}
          onChange={(event) => switchKind(event.target.value as MasterKind)}
        >
          {MODULES.filter((mod) => SIMPLE_KINDS.some((k) => k.module === mod)).map((mod) => (
            <optgroup key={mod} label={mod}>
              {SIMPLE_KINDS.filter((k) => k.module === mod).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search this master…"
        />
      </div>

      <Card className="mb-4">
        <CardBody>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim()) return
              setPending({
                title: editing ? 'Save changes' : 'Add to master',
                message: editing ? (
                  <p>
                    Rename <span className="font-semibold text-slate-900">{editing.name}</span> to{' '}
                    <span className="font-semibold text-slate-900">{name.trim()}</span> in{' '}
                    {kindLabel}?
                  </p>
                ) : (
                  <p>
                    Add <span className="font-semibold text-slate-900">{name.trim()}</span> to{' '}
                    {kindLabel}?
                  </p>
                ),
                confirmLabel: 'Save',
                run: async () => {
                  await save.mutateAsync(saveNamePayload())
                  toast.success(editing ? 'Master updated' : 'Master added')
                  setEditing(null)
                  setName('')
                },
              })
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Required name"
              required
            />
            <Button type="submit" loading={save.isPending}>
              <Plus className="size-4" /> {editing ? 'Save' : 'Add'}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null)
                  setName('')
                }}
              >
                <RotateCcw className="size-4" /> Cancel
              </Button>
            )}
          </form>
        </CardBody>
      </Card>

      <ColumnChips config={colConfig} title="Display headings" testid="masters-chips" />

      <Table data-testid="masters-table">
        <Thead>
          <tr>
            {colConfig.visible.map((c) => {
              const color = colConfig.colorOf(c.id)
              return (
                <Th
                  key={c.id}
                  className={c.id === 'actions' ? 'text-right' : undefined}
                  style={color ? { color } : undefined}
                >
                  {c.label}
                </Th>
              )
            })}
          </tr>
        </Thead>
        <Tbody>
          {filtered.map((item) => {
            const cells: Record<string, ReactNode> = {
              sequence: (
                <Td key="sequence">
                  <span className="flex items-center gap-2">
                    <GripVertical className="size-4 text-slate-400" />
                    <Input
                      key={`${item.id}-${item.sort_order}`}
                      aria-label={`Sequence for ${item.name}`}
                      type="number"
                      min={1}
                      defaultValue={item.sort_order}
                      className="h-8 w-20"
                      onClick={(event) => event.stopPropagation()}
                      onBlur={(event) => {
                        const next = Number(event.target.value)
                        if (!Number.isInteger(next) || next < 1 || next === item.sort_order) {
                          event.target.value = String(item.sort_order)
                          return
                        }
                        const field = event.target
                        setPending({
                          title: 'Change sequence',
                          message: (
                            <p>
                              Change the sequence of{' '}
                              <span className="font-semibold text-slate-900">{item.name}</span> from{' '}
                              {item.sort_order} to {next}?
                            </p>
                          ),
                          confirmLabel: 'Save',
                          run: async () => {
                            await save.mutateAsync({ ...item, sort_order: next })
                            toast.success('Sequence updated')
                          },
                          onCancel: () => {
                            field.value = String(item.sort_order)
                          },
                        })
                      }}
                    />
                  </span>
                </Td>
              ),
              name: (
                <Td key="name" className="font-medium">
                  {item.name}
                </Td>
              ),
              status: (
                <Td key="status">
                  <button
                    aria-label={`Toggle status of ${item.name}`}
                    onClick={() =>
                      setPending({
                        title: item.is_active ? 'Deactivate item' : 'Activate item',
                        message: (
                          <p>
                            Mark <span className="font-semibold text-slate-900">{item.name}</span>{' '}
                            as {item.is_active ? 'Inactive' : 'Active'}?
                            {item.is_active &&
                              ' It will stop appearing in dropdowns until it is activated again.'}
                          </p>
                        ),
                        confirmLabel: 'Save',
                        run: async () => {
                          await save.mutateAsync({ ...item, is_active: !item.is_active })
                          toast.success(item.is_active ? 'Marked inactive' : 'Marked active')
                        },
                      })
                    }
                  >
                    <Badge tone={item.is_active ? 'green' : 'slate'}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </button>
                </Td>
              ),
              actions: (
                <Td key="actions">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditing(item)
                        setName(item.name)
                      }}
                      aria-label={`Edit ${item.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() =>
                        setPending({
                          title: 'Delete item',
                          message: (
                            <p>
                              Delete{' '}
                              <span className="font-semibold text-slate-900">{item.name}</span> from{' '}
                              {kindLabel}? This cannot be undone.
                            </p>
                          ),
                          confirmLabel: 'Delete',
                          danger: true,
                          run: async () => {
                            await remove.mutateAsync(item.id)
                            toast.success('Master deleted')
                          },
                        })
                      }
                      aria-label={`Delete ${item.name}`}
                      className="text-red-500"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Td>
              ),
            }
            return (
              <tr
                key={item.id}
                draggable
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggedId || draggedId === item.id) return
                  const next = [...items]
                  const from = next.findIndex((entry) => entry.id === draggedId)
                  const to = next.findIndex((entry) => entry.id === item.id)
                  const [moved] = next.splice(from, 1)
                  next.splice(to, 0, moved)
                  setDraggedId(null)
                  setPending({
                    title: 'Change sequence',
                    message: (
                      <p>
                        Move <span className="font-semibold text-slate-900">{moved.name}</span> to
                        position {to + 1} in {kindLabel}?
                      </p>
                    ),
                    confirmLabel: 'Save',
                    run: async () => {
                      await reorder.mutateAsync(next)
                      toast.success('Sequence updated')
                    },
                  })
                }}
              >
                {colConfig.visible.map((c) => cells[c.id])}
              </tr>
            )
          })}
        </Tbody>
      </Table>

      <Card className="mt-6">
        <CardBody>
          <h2 className="mb-3 font-semibold text-slate-900">Master Audit Trail</h2>
          <div className="max-h-72 overflow-auto">
            <Table>
              <Thead>
                <tr>
                  <Th>User</Th>
                  <Th>Date & Time</Th>
                  <Th>Master</Th>
                  <Th>Change</Th>
                </tr>
              </Thead>
              <Tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <Td>{entry.changer?.full_name || entry.changer?.email || 'System'}</Td>
                    <Td>{formatDateTime(entry.changed_at)}</Td>
                    <Td>{entry.master_type}</Td>
                    <Td>
                      {entry.action}:{' '}
                      {String(entry.new_value?.name ?? entry.old_value?.name ?? entry.record_id)}
                    </Td>
                  </tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </CardBody>
      </Card>

      {pending && (
        <Modal open onClose={cancelPending} title={pending.title} testid="master-confirm-modal">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div
                className={
                  'flex size-9 shrink-0 items-center justify-center rounded-full ' +
                  (pending.danger ? 'bg-red-50' : 'bg-amber-50')
                }
              >
                <TriangleAlert
                  className={'size-5 ' + (pending.danger ? 'text-red-600' : 'text-amber-600')}
                />
              </div>
              <div className="text-sm text-slate-600">{pending.message}</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="master-confirm-cancel"
                disabled={applying}
                onClick={cancelPending}
              >
                Cancel
              </Button>
              {pending.discard && (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="master-confirm-discard"
                  disabled={applying}
                  onClick={() => {
                    pending.discard?.()
                    setPending(null)
                  }}
                >
                  Discard
                </Button>
              )}
              <Button
                type="button"
                variant={pending.danger ? 'danger' : 'primary'}
                data-testid="master-confirm-save"
                loading={applying}
                onClick={confirmPending}
              >
                {pending.confirmLabel}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
