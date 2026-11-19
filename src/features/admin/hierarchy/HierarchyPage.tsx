import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  useCompanies,
  useCreateDepartment,
  useCreateTeam,
  useDeleteDepartment,
  useDeleteTeam,
  useDepartments,
  useSaveCompany,
  useTeams,
  useUpdateTeamManager,
} from './hooks'
import { useUsers } from '@/features/admin/users/hooks'
import { useProfile } from '@/features/rbac/profile-context'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card, CardBody } from '@/components/ui/Card'
import { ColumnChips } from '@/components/ui/ColumnChips'
import { useColumnConfig } from '@/lib/useColumnConfig'
import { StickyHeader } from '@/components/ui/StickyHeader'
import { cn } from '@/lib/cn'

export function HierarchyPage() {
  const { hasPermission } = useProfile()
  const canManage = hasPermission('hierarchy.manage')
  const toast = useToast()

  const { data: companies = [] } = useCompanies()
  const { data: departments = [] } = useDepartments()
  const { data: teams = [] } = useTeams()
  const { data: users = [] } = useUsers()
  const updateManager = useUpdateTeamManager()
  const delDept = useDeleteDepartment()
  const delTeam = useDeleteTeam()
  const saveCompany = useSaveCompany()

  const [deptModal, setDeptModal] = useState(false)
  const [teamModal, setTeamModal] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [editingCompanyId, setEditingCompanyId] = useState<string | undefined>()
  const [deptFilter, setDeptFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [search, setSearch] = useState('')

  const nameById = useMemo(
    () => new Map(users.map((u) => [u.id, u.full_name || u.email])),
    [users],
  )
  const emailById = useMemo(
    () => new Map(users.map((u) => [u.id, u.email])),
    [users],
  )
  const membersByTeam = useMemo(() => {
    const map = new Map<string, typeof users>()
    for (const u of users) {
      if (!u.team_id) continue
      const arr = map.get(u.team_id) ?? []
      arr.push(u)
      map.set(u.team_id, arr)
    }
    return map
  }, [users])
  const membersByDept = useMemo(() => {
    const map = new Map<string, typeof users>()
    for (const u of users) {
      if (!u.department_id) continue
      const arr = map.get(u.department_id) ?? []
      arr.push(u)
      map.set(u.department_id, arr)
    }
    return map
  }, [users])

  // All data denormalized to one row per (department, team) pair. A dept with
  // no team still emits one row so admins can see empty departments.
  type Row = {
    deptId: string
    deptName: string
    company: string
    teamId: string | null
    teamName: string | null
    managerId: string | null
    members: typeof users
    deptMembers: typeof users
  }
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const d of departments) {
      const deptMembers = membersByDept.get(d.id) ?? []
      const deptTeams = teams.filter((t) => t.department_id === d.id)
      if (deptTeams.length === 0) {
        out.push({
          deptId: d.id,
          deptName: d.name,
          company: d.company?.name ?? '—',
          teamId: null,
          teamName: null,
          managerId: null,
          members: [],
          deptMembers,
        })
        continue
      }
      for (const t of deptTeams) {
        out.push({
          deptId: d.id,
          deptName: d.name,
          company: d.company?.name ?? '—',
          teamId: t.id,
          teamName: t.name,
          managerId: t.reporting_manager_id ?? null,
          members: membersByTeam.get(t.id) ?? [],
          deptMembers,
        })
      }
    }
    return out
  }, [departments, teams, membersByDept, membersByTeam])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (deptFilter && r.deptId !== deptFilter) return false
      if (managerFilter && r.managerId !== managerFilter) return false
      if (q) {
        const hay = [
          r.deptName,
          r.teamName ?? '',
          r.company,
          r.managerId ? (nameById.get(r.managerId) ?? '') : '',
          ...r.members.map((m) => m.full_name || m.email),
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, deptFilter, managerFilter, search, nameById])

  const COLUMNS = useMemo(
    () => [
      { id: 'sno', label: 'S.No' },
      { id: 'department', label: 'Department' },
      { id: 'team', label: 'Team' },
      { id: 'members', label: 'Members' },
      { id: 'manager', label: 'Manager' },
      { id: 'company', label: 'Company' },
      { id: 'actions', label: 'Actions' },
    ],
    [],
  )
  const colConfig = useColumnConfig('hierarchy', COLUMNS)
  const visibleIds = new Set(colConfig.visible.map((c) => c.id))
  const hasFilters = !!(deptFilter || managerFilter || search)

  return (
    <div data-testid="hierarchy-page">
      <StickyHeader testid="hierarchy-sticky-header">
      <PageHeader
        title="Departments & Teams"
        description="Structure your organisation. Assign reporting managers to teams."
      />

      {canManage && (
        <Card className="mb-6">
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
                Companies
              </h2>
              <span className="text-xs text-slate-400">Create or rename a company</span>
            </div>
            <form
              className="mb-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                saveCompany.mutate(
                  { id: editingCompanyId, name: companyName },
                  {
                    onSuccess: () => {
                      toast.success(editingCompanyId ? 'Company updated' : 'Company created')
                      setCompanyName('')
                      setEditingCompanyId(undefined)
                    },
                    onError: (error) => toast.error('Save failed', (error as Error).message),
                  },
                )
              }}
            >
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Company name"
                required
              />
              <Button type="submit" loading={saveCompany.isPending}>
                {editingCompanyId ? 'Save name' : 'New company'}
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {companies.map((company) => (
                <button
                  key={company.id}
                  className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  onClick={() => {
                    setEditingCompanyId(company.id)
                    setCompanyName(company.name)
                  }}
                >
                  {company.name} <Pencil className="size-3" />
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Departments &amp; Teams
        </h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              data-testid="new-department-button"
              onClick={() => setDeptModal(true)}
            >
              <Plus className="size-4" /> Department
            </Button>
            <Button size="sm" data-testid="new-team-button" onClick={() => setTeamModal(true)}>
              <Plus className="size-4" /> Team
            </Button>
          </div>
        )}
      </div>

      <ColumnChips
        config={colConfig}
        title="Display headings"
        testid="hierarchy-chips"
        className="mb-3"
      />

      <div className="mb-3 flex flex-wrap items-end gap-3" data-testid="hierarchy-filters">
        <div>
          <Label htmlFor="hier-dept-filter" className="text-xs text-slate-500">
            Department
          </Label>
          <Select
            id="hier-dept-filter"
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
        <div>
          <Label htmlFor="hier-mgr-filter" className="text-xs text-slate-500">
            Manager
          </Label>
          <Select
            id="hier-mgr-filter"
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
            className="w-48"
          >
            <option value="">All managers</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="hier-search" className="text-xs text-slate-500">
            Search
          </Label>
          <Input
            id="hier-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, member, email…"
            className="w-56"
          />
        </div>
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            data-testid="clear-hierarchy-filters"
            onClick={() => {
              setDeptFilter('')
              setManagerFilter('')
              setSearch('')
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>
      </StickyHeader>

      <div className="pt-4">
      {filteredRows.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No matches' : 'No departments or teams yet'}
          testid="hierarchy-empty"
        />
      ) : (
        <Table data-testid="hierarchy-table">
          <Thead>
            <tr>
              {colConfig.visible.map((c) => {
                const color = colConfig.colorOf(c.id)
                return (
                  <Th
                    key={c.id}
                    className={cn(
                      c.id === 'sno' && 'w-10',
                      c.id === 'actions' && 'w-20 text-right',
                    )}
                    style={color ? { color } : undefined}
                  >
                    {c.label}
                  </Th>
                )
              })}
            </tr>
          </Thead>
          <Tbody>
            {filteredRows.map((r, i) => {
              const firstOfDept =
                i === 0 || filteredRows[i - 1].deptId !== r.deptId
              const managerName = r.managerId ? (nameById.get(r.managerId) ?? '—') : '—'
              const managerEmail = r.managerId ? (emailById.get(r.managerId) ?? '') : ''
              return (
                <tr
                  key={`${r.deptId}-${r.teamId ?? 'none'}`}
                  data-testid="hierarchy-row"
                  data-dept={r.deptName}
                  data-team={r.teamName ?? ''}
                >
                  {visibleIds.has('sno') && (
                    <Td className="text-xs text-slate-400 tabular-nums">{i + 1}</Td>
                  )}
                  {visibleIds.has('department') && (
                    <Td className={firstOfDept ? 'font-medium text-slate-900' : 'text-slate-300'}>
                      {firstOfDept ? (
                        <>
                          {r.deptName}
                          <div className="text-xs font-normal text-slate-400">
                            {r.deptMembers.length} {r.deptMembers.length === 1 ? 'person' : 'people'} in dept
                          </div>
                        </>
                      ) : (
                        '↳'
                      )}
                    </Td>
                  )}
                  {visibleIds.has('team') && (
                    <Td className="font-medium text-slate-800">
                      {r.teamName ?? (
                        <span className="text-xs italic text-slate-400">No teams</span>
                      )}
                    </Td>
                  )}
                  {visibleIds.has('members') && (
                    <Td>
                      {r.members.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {r.members.slice(0, 3).map((m) => (
                            <span
                              key={m.id}
                              title={m.email}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                            >
                              {m.full_name || m.email}
                            </span>
                          ))}
                          {r.members.length > 3 && (
                            <span
                              className="text-[11px] text-slate-500"
                              title={r.members
                                .slice(3)
                                .map((m) => m.full_name || m.email)
                                .join(', ')}
                            >
                              +{r.members.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </Td>
                  )}
                  {visibleIds.has('manager') && (
                    <Td>
                      {r.teamId ? (
                        canManage ? (
                          <>
                            <Select
                              aria-label={`Manager for ${r.teamName}`}
                              value={r.managerId ?? ''}
                              onChange={(e) =>
                                updateManager.mutate({
                                  teamId: r.teamId!,
                                  managerId: e.target.value || null,
                                })
                              }
                              className="h-8 text-xs"
                            >
                              <option value="">— None —</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name || u.email}
                                </option>
                              ))}
                            </Select>
                            {r.managerId && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                {managerEmail}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div>{managerName}</div>
                            {managerEmail && (
                              <div className="text-[11px] text-slate-400">{managerEmail}</div>
                            )}
                          </>
                        )
                      ) : (
                        '—'
                      )}
                    </Td>
                  )}
                  {visibleIds.has('company') && (
                    <Td className="text-slate-500">{firstOfDept ? r.company : ''}</Td>
                  )}
                  {visibleIds.has('actions') && (
                    <Td>
                      <div className="flex justify-end gap-1">
                        {canManage && r.teamId && (
                          <button
                            aria-label={`Delete team ${r.teamName}`}
                            title={`Delete team ${r.teamName}`}
                            className="text-slate-400 hover:text-red-600"
                            onClick={() =>
                              delTeam.mutate(r.teamId!, {
                                onError: (e) =>
                                  toast.error('Delete failed', (e as Error).message),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                        {canManage && firstOfDept && (
                          <button
                            aria-label={`Delete department ${r.deptName}`}
                            title={`Delete department ${r.deptName}`}
                            className="text-slate-300 hover:text-red-600"
                            onClick={() =>
                              delDept.mutate(r.deptId, {
                                onError: (e) =>
                                  toast.error('Delete failed', (e as Error).message),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </Td>
                  )}
                </tr>
              )
            })}
          </Tbody>
        </Table>
      )}
      </div>

      <DepartmentModal open={deptModal} onClose={() => setDeptModal(false)} companies={companies} />
      <TeamModal open={teamModal} onClose={() => setTeamModal(false)} departments={departments} />
    </div>
  )
}

function DepartmentModal({
  open,
  onClose,
  companies,
}: {
  open: boolean
  onClose: () => void
  companies: { id: string; name: string }[]
}) {
  const create = useCreateDepartment()
  const toast = useToast()
  const [name, setName] = useState('')
  const [companyId, setCompanyId] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="New department" testid="department-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            { name: name.trim(), company_id: companyId || companies[0]?.id },
            {
              onSuccess: () => {
                toast.success('Department created')
                setName('')
                onClose()
              },
              onError: (err) => toast.error('Could not create', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="dept-company">Company</Label>
          <Select
            id="dept-company"
            data-testid="department-company-select"
            value={companyId || companies[0]?.id || ''}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="dept-name">Name</Label>
          <Input
            id="dept-name"
            data-testid="department-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="create-department-submit" loading={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TeamModal({
  open,
  onClose,
  departments,
}: {
  open: boolean
  onClose: () => void
  departments: { id: string; name: string }[]
}) {
  const create = useCreateTeam()
  const toast = useToast()
  const [name, setName] = useState('')
  const [deptId, setDeptId] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="New team" testid="team-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            { name: name.trim(), department_id: deptId || departments[0]?.id },
            {
              onSuccess: () => {
                toast.success('Team created')
                setName('')
                onClose()
              },
              onError: (err) => toast.error('Could not create', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="team-dept">Department</Label>
          <Select
            id="team-dept"
            data-testid="team-department-select"
            value={deptId || departments[0]?.id || ''}
            onChange={(e) => setDeptId(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="team-name">Name</Label>
          <Input
            id="team-name"
            data-testid="team-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="create-team-submit" loading={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}
