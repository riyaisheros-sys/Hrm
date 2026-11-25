import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  useCreateEmployee,
  useDeleteEmployee,
  useSetLeaveQuotas,
  useSetUserRoles,
  useUpdateCredentials,
  useUpdateProfile,
  useUserLeaveBalances,
  useUserFieldAccess,
  useSetUserFieldAccess,
  useUsers,
  type LeaveQuotaInput,
  type UserRow,
  uploadProfilePicture,
} from './hooks'
import { useLeaveTypes, type LeaveType } from '@/features/leave/hooks'
import { useRoles } from '@/features/admin/roles/hooks'
import { useDepartments, useTeams } from '@/features/admin/hierarchy/hooks'
import { useProfile } from '@/features/rbac/profile-context'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { StickyHeader } from '@/components/ui/StickyHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Checkbox } from '@/components/ui/Checkbox'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { ColumnChips } from '@/components/ui/ColumnChips'
import { SortFilterTh } from '@/components/ui/SortFilterTh'
import { FileInput } from '@/components/ui/FileInput'
import { useTableControls } from '@/lib/useTableControls'
import { PerformancePicker } from '@/features/performance/PerformancePicker'
import {
  setUserPerformanceItems,
  useUserPerformanceItems,
} from '@/features/performance/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { useColumnConfig } from '@/lib/useColumnConfig'

export function UsersPage() {
  const { hasPermission } = useProfile()
  const canManage = hasPermission('users.manage')
  const { data: users = [], isLoading } = useUsers()
  const { data: departments = [] } = useDepartments()
  const { data: teams = [] } = useTeams()
  const deleteEmployee = useDeleteEmployee()
  const toast = useToast()
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<UserRow | null>(null)

  const nameById = new Map(users.map((u) => [u.id, u.full_name || u.email]))
  const deptById = new Map(departments.map((d) => [d.id, d.name]))
  const teamById = new Map(teams.map((t) => [t.id, t.name]))
  const controls = useTableControls(users, {
    name: (u) => `${u.full_name ?? ''} ${u.email}`,
    code: (u) => u.employee_code,
    department: (u) => (u.department_id ? deptById.get(u.department_id) : ''),
    team: (u) => (u.team_id ? teamById.get(u.team_id) : ''),
    manager: (u) => (u.reporting_manager_id ? nameById.get(u.reporting_manager_id) : ''),
    roles: (u) => u.user_roles.map((ur) => ur.roles?.name ?? '').join(', '),
    status: (u) => u.status,
  })
  const pagination = usePagination(controls.rows, 25, controls.stateKey)
  const USER_COLS = [
    { id: 'sno', label: 'S.No' },
    { id: 'name', label: 'Name' },
    { id: 'code', label: 'Code' },
    { id: 'department', label: 'Department' },
    { id: 'team', label: 'Team' },
    { id: 'manager', label: 'Manager' },
    { id: 'roles', label: 'Roles' },
    { id: 'status', label: 'Status' },
  ]
  const colConfig = useColumnConfig('users', USER_COLS)

  return (
    <div data-testid="users-page">
      <StickyHeader testid="users-sticky-header">
        <PageHeader
          title="Users"
          description="View users, assign roles, departments, teams and reporting managers."
          actions={
            canManage && (
              <Button data-testid="add-employee-button" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add employee
              </Button>
            )
          }
        />
        <ColumnChips
          config={colConfig}
          title="Display headings"
          testid="users-chips"
          className="mb-0"
        />
      </StickyHeader>

      <div className="pt-4">
      <Table data-testid="users-table">
        <Thead>
          <tr>
            {colConfig.visible.map((c) => {
              const color = colConfig.colorOf(c.id)
              return c.id === 'sno' ? (
                <Th key={c.id} className="w-10" style={color ? { color } : undefined}>
                  {c.label}
                </Th>
              ) : (
                <SortFilterTh
                  key={c.id}
                  controls={controls}
                  k={c.id}
                  style={color ? { color } : undefined}
                >
                  {c.label}
                </SortFilterTh>
              )
            })}
            {canManage && <Th className="w-10" />}
          </tr>
        </Thead>
        <Tbody>
          {isLoading && (
            <tr>
              <Td colSpan={colConfig.visible.length + (canManage ? 1 : 0)}>Loading…</Td>
            </tr>
          )}
          {pagination.pagedItems.map((u, i) => (
            <tr key={u.id} data-testid={`user-row-${u.email}`}>
              {colConfig.visible.map((c) => {
                switch (c.id) {
                  case 'sno':
                    return (
                      <Td key={c.id} className="w-10 text-xs text-slate-400 tabular-nums">
                        {pagination.pageStart + i + 1}
                      </Td>
                    )
                  case 'name':
                    return (
                      <Td key={c.id} className="font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="size-8 rounded-full object-cover" />
                          ) : (
                            <span className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs">
                              {(u.full_name || u.email).slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span>{u.full_name || '—'}</span>
                        </div>
                        <div className="text-xs font-normal text-slate-500">{u.email}</div>
                      </Td>
                    )
                  case 'code':
                    return <Td key={c.id}>{u.employee_code ?? '—'}</Td>
                  case 'department':
                    return (
                      <Td key={c.id}>
                        {u.department_id ? (deptById.get(u.department_id) ?? '—') : '—'}
                      </Td>
                    )
                  case 'team':
                    return (
                      <Td key={c.id}>{u.team_id ? (teamById.get(u.team_id) ?? '—') : '—'}</Td>
                    )
                  case 'manager':
                    return (
                      <Td key={c.id}>
                        {u.reporting_manager_id
                          ? (nameById.get(u.reporting_manager_id) ?? '—')
                          : '—'}
                      </Td>
                    )
                  case 'roles':
                    return (
                      <Td key={c.id}>
                        <div className="flex flex-wrap gap-1">
                          {u.user_roles.map((ur) => (
                            <Badge key={ur.role_id} tone="brand">
                              {ur.roles?.name ?? ur.role_id}
                            </Badge>
                          ))}
                        </div>
                      </Td>
                    )
                  case 'status':
                    return (
                      <Td key={c.id}>
                        <Badge
                          tone={u.status === 'active' ? 'green' : 'slate'}
                          data-testid="user-status"
                        >
                          {u.status}
                        </Badge>
                      </Td>
                    )
                  default:
                    return null
                }
              })}
              {canManage && (
                <Td>
                  <div className="flex justify-end gap-2">
                    <button
                      data-testid={`edit-user-${u.email}`}
                      aria-label={`Edit ${u.full_name || u.email}`}
                      className="hover:text-brand-600 text-slate-400"
                      onClick={() => setEditing(u)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      data-testid={`delete-user-${u.email}`}
                      aria-label={`Delete ${u.full_name || u.email}`}
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => setDeleting(u)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Td>
              )}
            </tr>
          ))}
        </Tbody>
      </Table>
      <Pagination {...pagination} testid="users-pagination" />
      </div>

      {editing && (
        <EditUserModal user={editing} onClose={() => setEditing(null)} allUsers={users} />
      )}
      {adding && <AddEmployeeModal onClose={() => setAdding(false)} allUsers={users} />}
      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title="Delete employee" testid="delete-modal">
          <p className="text-sm text-slate-600">
            Permanently delete <strong>{deleting.full_name || deleting.email}</strong> and their
            login? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-user"
              loading={deleteEmployee.isPending}
              onClick={() =>
                deleteEmployee.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.success('Employee deleted')
                    setDeleting(null)
                  },
                  onError: (e) => toast.error('Delete failed', (e as Error).message),
                })
              }
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/**
 * Per-type annual quota inputs shared by the add & edit employee modals.
 * `baseline` supplies the shown value until the admin overrides a field;
 * `usedByType` (edit mode) surfaces how much is already consumed.
 */
function LeaveQuotaFields({
  types,
  baseline,
  overrides,
  onChange,
  usedByType,
  testPrefix,
}: {
  types: LeaveType[]
  baseline: (t: LeaveType) => number
  overrides: Record<string, string>
  onChange: (typeId: string, value: string) => void
  usedByType?: Map<string, number>
  testPrefix: string
}) {
  if (types.length === 0) return null
  return (
    <div>
      <Label>Leave quotas (days / year)</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        {types.map((t) => (
          <div key={t.id}>
            <Label
              htmlFor={`${testPrefix}-${t.slug}`}
              className="text-xs font-normal text-slate-500"
            >
              {t.name}
              {!t.is_paid && ' (unpaid)'}
            </Label>
            <Input
              id={`${testPrefix}-${t.slug}`}
              data-testid={`${testPrefix}-${t.slug}`}
              type="number"
              min={0}
              step={0.5}
              value={overrides[t.id] ?? String(baseline(t))}
              onChange={(e) => onChange(t.id, e.target.value)}
            />
            {usedByType?.has(t.id) && (
              <p className="mt-0.5 text-xs text-slate-400">Used {usedByType.get(t.id)} this year</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function EditUserModal({
  user,
  onClose,
  allUsers,
}: {
  user: UserRow
  onClose: () => void
  allUsers: UserRow[]
}) {
  const { data: roles = [] } = useRoles()
  const { data: departments = [] } = useDepartments()
  const { data: teams = [] } = useTeams()
  const { data: leaveTypes = [] } = useLeaveTypes()
  const { data: balances = [] } = useUserLeaveBalances(user.id)
  const updateProfile = useUpdateProfile()
  const setUserRoles = useSetUserRoles()
  const updateCredentials = useUpdateCredentials()
  const setLeaveQuotas = useSetLeaveQuotas()
  const toast = useToast()
  const [fieldModule, setFieldModule] = useState('attendance')
  const { data: userFieldAccess = new Map<string, boolean>() } = useUserFieldAccess(
    user.id,
    fieldModule,
  )
  const setUserFieldAccess = useSetUserFieldAccess()
  const fieldCatalog: Record<string, string[]> = {
    attendance: ['date', 'status', 'firstIn', 'lastOut', 'worked', 'late', 'overtime', 'remarks'],
    tasks: [
      'title',
      'assignee',
      'assignor',
      'status',
      'priority',
      'progress',
      'created',
      'due',
      'completed',
    ],
    leave: ['employee', 'type', 'from', 'to', 'days', 'status', 'reason', 'remainingBalance'],
  }

  const [roleIds, setRoleIds] = useState<Set<string>>(
    new Set(user.user_roles.map((ur) => ur.role_id)),
  )
  const [quotaOverrides, setQuotaOverrides] = useState<Record<string, string>>({})
  const allocatedByType = new Map(balances.map((b) => [b.leave_type_id, Number(b.allocated)]))
  const usedByType = new Map(balances.map((b) => [b.leave_type_id, Number(b.used)]))
  const quotaBaseline = (t: LeaveType) => allocatedByType.get(t.id) ?? 0
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [email, setEmail] = useState(user.email)
  const [newPassword, setNewPassword] = useState('')
  const [departmentId, setDepartmentId] = useState(user.department_id ?? '')
  const [teamId, setTeamId] = useState(user.team_id ?? '')
  const [managerId, setManagerId] = useState(user.reporting_manager_id ?? '')
  const [status, setStatus] = useState<'active' | 'inactive'>(user.status as 'active' | 'inactive')
  const [taskCapacity, setTaskCapacity] = useState(
    user.task_capacity != null ? String(user.task_capacity) : '',
  )
  const qc = useQueryClient()
  const { data: savedItems } = useUserPerformanceItems(user.id)
  const [designationId, setDesignationId] = useState(user.designation_id ?? '')
  // '' = automatic, 'counted' = always counted, 'exempt' = never counted.
  const initialAttendance =
    user.attendance_exempt === true ? 'exempt' : user.attendance_exempt === false ? 'counted' : ''
  const [attendanceMode, setAttendanceMode] = useState(initialAttendance)
  // The column arrives with a database update; until then the choice is locked.
  const attendanceModeSupported = 'attendance_exempt' in user
  // null = untouched, show what is saved; a Set = the admin's pending choice.
  const [itemDraft, setItemDraft] = useState<Set<string> | null>(null)
  const selectedItems = itemDraft ?? savedItems ?? new Set<string>()
  const [kraValue, setKraValue] = useState(
    user.kra_value != null ? String(user.kra_value) : '',
  )
  const [kpiValue, setKpiValue] = useState(
    user.kpi_value != null ? String(user.kpi_value) : '',
  )

  const saving =
    updateProfile.isPending ||
    setUserRoles.isPending ||
    updateCredentials.isPending ||
    setLeaveQuotas.isPending

  async function save() {
    try {
      await updateProfile.mutateAsync({
        id: user.id,
        full_name: fullName.trim(),
        department_id: departmentId || null,
        team_id: teamId || null,
        reporting_manager_id: managerId || null,
        status,
        task_capacity: taskCapacity.trim() ? Math.max(1, Math.round(Number(taskCapacity))) : null,
        kra_value: kraValue.trim() ? Number(kraValue) : null,
        kpi_value: kpiValue.trim() ? Number(kpiValue) : null,
        // Only sent when changed, so saving a user keeps working on a database
        // that does not have the designation column yet.
        ...(designationId !== (user.designation_id ?? '')
          ? { designation_id: designationId || null }
          : {}),
        ...(attendanceMode !== initialAttendance
          ? {
              attendance_exempt:
                attendanceMode === 'exempt' ? true : attendanceMode === 'counted' ? false : null,
            }
          : {}),
      })
      if (itemDraft) {
        await setUserPerformanceItems(user.id, [...itemDraft])
        qc.invalidateQueries({ queryKey: ['user-performance-items', user.id] })
      }
      await setUserRoles.mutateAsync({ userId: user.id, roleIds: [...roleIds] })
      if (Object.keys(quotaOverrides).length > 0) {
        const quotas: LeaveQuotaInput[] = leaveTypes.map((t) => ({
          leaveTypeId: t.id,
          allocated: Number(quotaOverrides[t.id] ?? quotaBaseline(t)) || 0,
        }))
        await setLeaveQuotas.mutateAsync({ userId: user.id, quotas })
      }
      const emailChanged = email.trim() && email.trim() !== user.email
      if (emailChanged || newPassword.trim()) {
        await updateCredentials.mutateAsync({
          userId: user.id,
          email: emailChanged ? email.trim() : undefined,
          password: newPassword.trim() || undefined,
        })
      }
      toast.success('Employee updated')
      onClose()
    } catch (e) {
      toast.error('Update failed', (e as Error).message)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.full_name || user.email}`}
      testid="user-modal"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="user-name">Full name</Label>
          <Input
            id="user-name"
            data-testid="user-name-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Employee full name"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="user-email">Email (username)</Label>
            <Input
              id="user-email"
              data-testid="user-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="user-password">New password</Label>
            <Input
              id="user-password"
              data-testid="user-password-input"
              type="text"
              placeholder="Leave blank to keep current"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="user-dept">Department</Label>
            <Select
              id="user-dept"
              data-testid="user-department-select"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="user-team">Team</Label>
            <Select
              id="user-team"
              data-testid="user-team-select"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">— None —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="user-manager">Reporting manager</Label>
            <Select
              id="user-manager"
              data-testid="user-manager-select"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="">— None —</option>
              {allUsers
                .filter((u) => u.id !== user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="user-status">Status</Label>
            <Select
              id="user-status"
              data-testid="user-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="user-attendance-mode">Attendance</Label>
            <Select
              id="user-attendance-mode"
              data-testid="user-attendance-mode"
              value={attendanceMode}
              disabled={!attendanceModeSupported}
              onChange={(e) => setAttendanceMode(e.target.value)}
            >
              <option value="">Automatic</option>
              <option value="counted">Marks attendance — count if absent</option>
              <option value="exempt">Does not mark attendance — never absent</option>
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              {attendanceModeSupported
                ? 'Automatic: counted for Present / Absent only once they have marked attendance at least once.'
                : 'Automatic for now — this choice becomes available after the pending database update.'}
            </p>
          </div>
          <div>
            <Label htmlFor="user-task-capacity">Task capacity</Label>
            <Input
              id="user-task-capacity"
              data-testid="user-task-capacity"
              type="number"
              min="1"
              placeholder="Default from policy"
              value={taskCapacity}
              onChange={(e) => setTaskCapacity(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Max pending tasks before planning is blocked. Leave empty to use the global default.
            </p>
          </div>
        </div>

        <div>
          <Label>Roles</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((r) => (
              <Checkbox
                key={r.id}
                id={`user-role-${r.slug}`}
                data-testid={`user-role-${r.slug}`}
                label={r.name}
                checked={roleIds.has(r.id)}
                onChange={(e) => {
                  setRoleIds((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(r.id)
                    else next.delete(r.id)
                    return next
                  })
                }}
              />
            ))}
          </div>
        </div>

        <PerformancePicker
          idPrefix="user"
          departmentId={departmentId}
          designationId={designationId}
          selected={selectedItems}
          onDesignationChange={(id, defaults) => {
            setDesignationId(id)
            if (id) setItemDraft(defaults)
          }}
          onSelectedChange={setItemDraft}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="user-kra">KRA target (number)</Label>
            <Input
              id="user-kra"
              data-testid="user-kra-input"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 20"
              value={kraValue}
              onChange={(e) => setKraValue(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Numeric target (Key Result Area).
            </p>
          </div>
          <div>
            <Label htmlFor="user-kpi">KPI target (number)</Label>
            <Input
              id="user-kpi"
              data-testid="user-kpi-input"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 85"
              value={kpiValue}
              onChange={(e) => setKpiValue(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Numeric target (Key Performance Indicator).
            </p>
          </div>
        </div>

        <LeaveQuotaFields
          types={leaveTypes}
          baseline={quotaBaseline}
          overrides={quotaOverrides}
          onChange={(typeId, value) => setQuotaOverrides((prev) => ({ ...prev, [typeId]: value }))}
          usedByType={usedByType}
          testPrefix="edit-quota"
        />

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label>User-specific field access</Label>
            <Select
              value={fieldModule}
              onChange={(event) => setFieldModule(event.target.value)}
              className="w-36"
            >
              {Object.keys(fieldCatalog).map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fieldCatalog[fieldModule].map((field) => (
              <Checkbox
                key={field}
                label={field}
                checked={userFieldAccess.get(field) ?? true}
                onChange={(event) =>
                  setUserFieldAccess.mutate({
                    userId: user.id,
                    module: fieldModule,
                    fieldKey: field,
                    visible: event.target.checked,
                  })
                }
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button data-testid="save-user-submit" loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AddEmployeeModal({ onClose, allUsers }: { onClose: () => void; allUsers: UserRow[] }) {
  const create = useCreateEmployee()
  const { data: roles = [] } = useRoles()
  const { data: departments = [] } = useDepartments()
  const { data: teams = [] } = useTeams()
  const { data: leaveTypes = [] } = useLeaveTypes()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set())
  const [quotaOverrides, setQuotaOverrides] = useState<Record<string, string>>({})
  const [kraValue, setKraValue] = useState('')
  const [kpiValue, setKpiValue] = useState('')
  const [designationId, setDesignationId] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const updateProfile = useUpdateProfile()
  const [pictureFiles, setPictureFiles] = useState<File[]>([])
  const quotaBaseline = (t: LeaveType) => Number(t.default_annual_quota)

  return (
    <Modal open onClose={onClose} title="Add employee" testid="add-employee-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            {
              email: email.trim(),
              password,
              fullName: fullName.trim(),
              employeeCode: employeeCode.trim() || undefined,
              departmentId: departmentId || null,
              teamId: teamId || null,
              managerId: managerId || null,
              roleIds: [...roleIds],
              leaveQuotas: leaveTypes.map((t) => ({
                leaveTypeId: t.id,
                allocated: Number(quotaOverrides[t.id] ?? quotaBaseline(t)) || 0,
              })),
              kra_value: kraValue.trim() ? Number(kraValue) : null,
              kpi_value: kpiValue.trim() ? Number(kpiValue) : null,
            },
            {
              onSuccess: async (created) => {
                const picture = pictureFiles[0]
                if (picture) await uploadProfilePicture(created.userId, picture)
                // Designation + KRA / KPI are written straight after creation.
                try {
                  if (designationId)
                    await updateProfile.mutateAsync({
                      id: created.userId,
                      designation_id: designationId,
                    })
                  if (selectedItems.size)
                    await setUserPerformanceItems(created.userId, [...selectedItems])
                } catch (err) {
                  toast.error(
                    'Employee created, but designation / KRA / KPI were not saved',
                    (err as Error).message,
                  )
                }
                toast.success('Employee created', 'Share the temporary password out-of-band.')
                onClose()
              },
              onError: (err) => toast.error('Could not create employee', (err as Error).message),
            },
          )
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ne-email">Email</Label>
            <Input
              id="ne-email"
              data-testid="new-emp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="ne-password">Temporary password</Label>
            <Input
              id="ne-password"
              data-testid="new-emp-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="ne-name">Full name</Label>
            <Input
              id="ne-name"
              data-testid="new-emp-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="ne-code">Employee code</Label>
            <Input
              id="ne-code"
              data-testid="new-emp-code"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ne-dept">Department</Label>
            <Select
              id="ne-dept"
              data-testid="new-emp-dept"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ne-team">Team</Label>
            <Select
              id="ne-team"
              data-testid="new-emp-team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">— None —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-2">
            <Label htmlFor="ne-manager">Reporting manager</Label>
            <Select
              id="ne-manager"
              data-testid="new-emp-manager"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="">— None —</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="new-emp-picture">Profile picture</Label>
          <FileInput
            id="new-emp-picture"
            testid="new-emp-picture"
            accept="image/*"
            files={pictureFiles}
            onChange={setPictureFiles}
            hint="JPG or PNG"
          />
        </div>
        <div>
          <Label>Roles</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((r) => (
              <Checkbox
                key={r.id}
                id={`new-emp-role-${r.slug}`}
                data-testid={`new-emp-role-${r.slug}`}
                label={r.name}
                checked={roleIds.has(r.id)}
                onChange={(e) =>
                  setRoleIds((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(r.id)
                    else next.delete(r.id)
                    return next
                  })
                }
              />
            ))}
          </div>
        </div>
        <PerformancePicker
          idPrefix="new-emp"
          departmentId={departmentId}
          designationId={designationId}
          selected={selectedItems}
          onDesignationChange={(id, defaults) => {
            setDesignationId(id)
            if (id) setSelectedItems(defaults)
          }}
          onSelectedChange={setSelectedItems}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ne-kra">KRA target (number)</Label>
            <Input
              id="ne-kra"
              data-testid="new-emp-kra"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 20"
              value={kraValue}
              onChange={(e) => setKraValue(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ne-kpi">KPI target (number)</Label>
            <Input
              id="ne-kpi"
              data-testid="new-emp-kpi"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 85"
              value={kpiValue}
              onChange={(e) => setKpiValue(e.target.value)}
            />
          </div>
        </div>
        <LeaveQuotaFields
          types={leaveTypes}
          baseline={quotaBaseline}
          overrides={quotaOverrides}
          onChange={(typeId, value) => setQuotaOverrides((prev) => ({ ...prev, [typeId]: value }))}
          testPrefix="new-quota"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="create-employee-submit" loading={create.isPending}>
            Create employee
          </Button>
        </div>
      </form>
    </Modal>
  )
}
