import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, ChevronDown, ChevronRight, Network, Pencil, Search, Users } from 'lucide-react'
import { useProfile } from '@/features/rbac/profile-context'
import { supabase } from '@/lib/supabase'
import { usePeople, type Person } from '@/lib/people'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'

/** Departments, teams and the company name — readable by every signed-in user. */
function useOrgUnits() {
  return useQuery({
    queryKey: ['org-units'],
    staleTime: 60_000,
    queryFn: async () => {
      const [companies, departments, teams] = await Promise.all([
        supabase.from('companies').select('id,name').order('name'),
        supabase.from('departments').select('id,name,company_id').order('name'),
        supabase.from('teams').select('id,name,department_id,reporting_manager_id').order('name'),
      ])
      if (departments.error) throw departments.error
      if (teams.error) throw teams.error
      return {
        companies: companies.data ?? [],
        departments: departments.data ?? [],
        teams: teams.data ?? [],
      }
    },
  })
}

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

/**
 * Organization structure (client, 26 Nov): who reports to whom, and how
 * departments and teams are made up. View-only; changes are made in Users and
 * Departments & Teams.
 */
export function OrgStructurePage() {
  const { hasPermission } = useProfile()
  const { data: peopleAll = [], isLoading } = usePeople()
  const { data: units } = useOrgUnits()
  const [view, setView] = useState<'tree' | 'departments'>('tree')
  const [search, setSearch] = useState('')
  const people = useMemo(() => peopleAll.filter((p) => p.status === 'active'), [peopleAll])
  const deptName = useMemo(
    () => new Map((units?.departments ?? []).map((d) => [d.id, d.name])),
    [units],
  )
  const teamName = useMemo(() => new Map((units?.teams ?? []).map((t) => [t.id, t.name])), [units])
  const needle = search.trim().toLowerCase()
  const matches = (p: Person) =>
    !needle ||
    [p.full_name, p.email, p.designation, p.employee_code, deptName.get(p.department_id ?? '')]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))

  const company = units?.companies?.[0]?.name

  return (
    <div data-testid="org-structure-page">
      <PageHeader
        title="Organization Structure"
        description={`${company ? `${company} · ` : ''}${people.length} people · ${units?.departments.length ?? 0} departments · ${units?.teams.length ?? 0} teams`}
        actions={
          hasPermission('hierarchy.view') && (
            <Link
              to="/admin/hierarchy"
              data-testid="org-edit-structure"
              className="text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
            >
              <Pencil className="size-4" /> Edit departments &amp; teams
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(
            [
              ['tree', 'Reporting tree', Network],
              ['departments', 'By department', Building2],
            ] as const
          ).map(([key, text, Icon]) => (
            <button
              key={key}
              type="button"
              data-testid={`org-view-${key}`}
              onClick={() => setView(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                view === key ? 'text-brand-700 bg-white shadow-sm' : 'text-slate-500',
              )}
            >
              <Icon className="size-3.5" /> {text}
            </button>
          ))}
        </div>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-slate-400" />
          <Input
            data-testid="org-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a person, designation or department"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : people.length === 0 ? (
        <EmptyState title="No people to show" testid="org-empty" />
      ) : view === 'tree' ? (
        <ReportingTree
          people={people}
          deptName={deptName}
          teamName={teamName}
          matches={matches}
          searching={!!needle}
        />
      ) : (
        <ByDepartment
          people={people}
          departments={units?.departments ?? []}
          teams={units?.teams ?? []}
          matches={matches}
        />
      )}
    </div>
  )
}

function PersonCard({
  person,
  deptName,
  teamName,
  reports,
  highlight,
}: {
  person: Person
  deptName: Map<string, string>
  teamName: Map<string, string>
  reports: number
  highlight: boolean
}) {
  const name = person.full_name || person.email
  return (
    <div
      data-testid="org-person"
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-2 shadow-sm',
        highlight ? 'border-brand-400 ring-brand-200 ring-2' : 'border-slate-200',
      )}
    >
      {person.avatar_url ? (
        <img src={person.avatar_url} alt="" className="size-9 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="bg-brand-100 text-brand-700 grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">
          {initials(name)}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
        <p className="truncate text-xs text-slate-500">
          {person.designation || 'No designation'}
          {person.department_id && deptName.get(person.department_id)
            ? ` · ${deptName.get(person.department_id)}`
            : ''}
          {person.team_id && teamName.get(person.team_id) ? ` · ${teamName.get(person.team_id)}` : ''}
        </p>
      </div>
      {reports > 0 && (
        <Badge tone="blue" className="ml-auto shrink-0">
          {reports} report{reports === 1 ? '' : 's'}
        </Badge>
      )}
    </div>
  )
}

function ReportingTree({
  people,
  deptName,
  teamName,
  matches,
  searching,
}: {
  people: Person[]
  deptName: Map<string, string>
  teamName: Map<string, string>
  matches: (p: Person) => boolean
  searching: boolean
}) {
  const ids = new Set(people.map((p) => p.id))
  const childrenOf = useMemo(() => {
    const map = new Map<string, Person[]>()
    for (const p of people) {
      const boss = p.reporting_manager_id && ids.has(p.reporting_manager_id) ? p.reporting_manager_id : ''
      if (boss === p.id) continue
      const list = map.get(boss) ?? []
      list.push(p)
      map.set(boss, list)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people])
  // Top of the tree: people with no manager (or a manager who is not active).
  const roots = childrenOf.get('') ?? []
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Does this person or anyone under them match the search?
  const visible = (p: Person, seen = new Set<string>()): boolean => {
    if (matches(p)) return true
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return (childrenOf.get(p.id) ?? []).some((c) => visible(c, seen))
  }

  const render = (p: Person, depth: number, seen: Set<string>) => {
    if (seen.has(p.id) || !visible(p)) return null
    seen.add(p.id)
    const kids = (childrenOf.get(p.id) ?? []).filter((c) => visible(c))
    const open = searching || !collapsed.has(p.id)
    return (
      <li key={p.id} className="relative">
        <div className="flex items-center gap-1">
          {kids.length > 0 ? (
            <button
              type="button"
              aria-label={open ? 'Collapse' : 'Expand'}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev)
                  if (next.has(p.id)) next.delete(p.id)
                  else next.add(p.id)
                  return next
                })
              }
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <span className="inline-block w-5" />
          )}
          <div className="w-full max-w-md">
            <PersonCard
              person={p}
              deptName={deptName}
              teamName={teamName}
              reports={(childrenOf.get(p.id) ?? []).length}
              highlight={searching && matches(p)}
            />
          </div>
        </div>
        {open && kids.length > 0 && (
          <ul className="mt-2 ml-7 space-y-2 border-l-2 border-slate-200 pl-4">
            {kids.map((k) => render(k, depth + 1, seen))}
          </ul>
        )}
      </li>
    )
  }

  const seen = new Set<string>()
  return (
    <Card>
      <CardBody>
        <p className="mb-3 text-xs text-slate-500">
          Each person sits under their reporting manager (set in Users → Edit). People without a
          manager are at the top.
        </p>
        <ul className="space-y-2" data-testid="org-tree">
          {roots.map((r) => render(r, 0, seen))}
        </ul>
      </CardBody>
    </Card>
  )
}

function ByDepartment({
  people,
  departments,
  teams,
  matches,
}: {
  people: Person[]
  departments: { id: string; name: string }[]
  teams: { id: string; name: string; department_id: string | null; reporting_manager_id: string | null }[]
  matches: (p: Person) => boolean
}) {
  const nameOf = (id: string | null | undefined) => {
    const p = people.find((x) => x.id === id)
    return p ? p.full_name || p.email : null
  }
  const groups = [
    ...departments.map((d) => ({ id: d.id, name: d.name })),
    { id: '', name: 'No department' },
  ]
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="org-departments">
      {groups.map((g) => {
        const members = people.filter((p) => (p.department_id ?? '') === g.id && matches(p))
        const deptTeams = teams.filter((t) => (t.department_id ?? '') === g.id)
        if (g.id === '' && members.length === 0) return null
        return (
          <Card key={g.id || 'none'} data-testid="org-department">
            <CardBody>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Building2 className="text-brand-600 size-4" /> {g.name}
                </h3>
                <Badge tone="slate">
                  <Users className="mr-1 inline size-3" />
                  {members.length}
                </Badge>
              </div>
              {deptTeams.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {deptTeams.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-md bg-violet-50 px-2 py-0.5 text-xs text-violet-700"
                      title={t.reporting_manager_id ? `Manager: ${nameOf(t.reporting_manager_id) ?? '—'}` : undefined}
                    >
                      {t.name}
                      {t.reporting_manager_id && nameOf(t.reporting_manager_id)
                        ? ` · ${nameOf(t.reporting_manager_id)}`
                        : ''}
                    </span>
                  ))}
                </div>
              )}
              {members.length === 0 ? (
                <p className="text-xs text-slate-400">No one here yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">
                          {m.full_name || m.email}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {m.designation || 'No designation'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-400">
                        {nameOf(m.reporting_manager_id) ? `→ ${nameOf(m.reporting_manager_id)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}
