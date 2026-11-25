import { useMemo, useState } from 'react'
import { usePagination } from '@/lib/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SortFilterTh } from '@/components/ui/SortFilterTh'
import { useTableControls } from '@/lib/useTableControls'
import { Check, CheckCheck, ChevronDown, ChevronRight, Eye, EyeOff, FolderOpen, History, MessageSquarePlus, Pencil, Plus, Send, Settings2, Trash2, Undo2, Users as UsersIcon, X } from 'lucide-react'
import {
  useCreateStatus,
  useCreateTask,
  useDeleteStatus,
  useDeleteTask,
  useTaskHistory,
  useTaskPlanning,
  useTaskCategories,
  useTaskStatuses,
  useTasks,
  useTasksRealtime,
  useAddTaskRemark,
  useTaskRemarks,
  useUpdateTask,
  useUpdateTaskStatus,
  useUpdateTaskDueDate,
  useUpdateTaskProgress,
  useAcceptTask,
  useRejectTask,
  useStartTask,
  useSubmitTask,
  useApproveTask,
  useReworkTask,
  useOpenTaskCount,
  useEffectiveCapacity,
  useTaskPolicy,
  useUpdateTaskPolicy,
  type TaskRow,
} from './hooks'
import { availableActions, styleForStatus } from './status-ui'
import { useActivePeople } from '@/lib/people'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/rbac/profile-context'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/format'
import { getTaskDelay, type TaskDelayState } from './delay'

// Due-date text colour reflects the state so overdue tasks pop in the list.
const DUE_DATE_COLOUR: Record<TaskDelayState, string> = {
  no_due_date: 'text-slate-400',
  upcoming: 'text-emerald-600',
  due_today: 'text-amber-600 font-medium',
  overdue: 'text-red-600 font-semibold',
  completed_on_time: 'text-emerald-600',
  completed_late: 'text-red-600 font-medium',
}
const dueDateClass = (state: TaskDelayState) => DUE_DATE_COLOUR[state]

const PRIORITY_TONE = { low: 'slate', medium: 'blue', high: 'red' } as const

type DisplayItem =
  | { kind: 'single'; task: TaskRow }
  | { kind: 'bulk'; key: string; tasks: TaskRow[] }

export function TasksPage() {
  const { user } = useAuth()
  const { hasPermission } = useProfile()
  const canAssign = hasPermission('tasks.assign')
  const canViewAll = hasPermission('tasks.view_all')
  const canManageStatuses = hasPermission('tasks.manage')

  useTasksRealtime()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: statuses = [] } = useTaskStatuses()
  const { data: taskGroups = [] } = useTaskCategories()
  const [filter, setFilter] = useState<'mine' | 'all'>(canViewAll ? 'all' : 'mine')
  const [assignorFilter, setAssignorFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch] = useState('')
  // Quick views from the summary cards.
  const [quick, setQuick] = useState<'' | 'overdue' | 'due_today'>('')
  const [newOpen, setNewOpen] = useState(false)
  const [statusTask, setStatusTask] = useState<TaskRow | null>(null)
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [historyTask, setHistoryTask] = useState<TaskRow | null>(null)
  const [remarkTask, setRemarkTask] = useState<TaskRow | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [groupBy, setGroupBy] = useState<'none' | 'project'>('none')
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<TaskRow | null>(null)
  const deleteTask = useDeleteTask()
  const toast = useToast()

  const inView = useMemo(
    () =>
      filter === 'all' && canViewAll
        ? tasks
        : tasks.filter((t) => t.created_by === user?.id || t.assignee_id === user?.id),
    [tasks, filter, canViewAll, user?.id],
  )

  // Filter options come from the tasks themselves, so they work for employees
  // who cannot list every user.
  const { assignors, assignees } = useMemo(() => {
    const by = new Map<string, string>()
    const to = new Map<string, string>()
    for (const t of inView) {
      if (t.creator) by.set(t.creator.id, t.creator.full_name || t.creator.email)
      if (t.assignee) to.set(t.assignee.id, t.assignee.full_name || t.assignee.email)
    }
    const sorted = (m: Map<string, string>) =>
      [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    return { assignors: sorted(by), assignees: sorted(to) }
  }, [inView])

  const needle = search.trim().toLowerCase()
  const scoped = useMemo(
    () =>
      inView.filter(
        (t) =>
          (!assignorFilter || t.created_by === assignorFilter) &&
          (!assigneeFilter || t.assignee_id === assigneeFilter) &&
          (!groupFilter ||
            (groupFilter === '__none' ? !t.category_id : t.category_id === groupFilter)) &&
          (!priorityFilter || t.priority === priorityFilter) &&
          (!needle ||
            t.title.toLowerCase().includes(needle) ||
            (t.description ?? '').toLowerCase().includes(needle)),
      ),
    [inView, assignorFilter, assigneeFilter, groupFilter, priorityFilter, needle],
  )

  // Summary cards: counts over the current scope (filters except status).
  const summary = useMemo(() => {
    let open = 0
    let overdue = 0
    let dueToday = 0
    let done = 0
    for (const t of scoped) {
      if (t.status?.is_terminal) {
        done++
        continue
      }
      open++
      const state = getTaskDelay(t.due_date, t.completed_at).state
      if (state === 'overdue') overdue++
      else if (state === 'due_today') dueToday++
    }
    return { open, overdue, dueToday, done }
  }, [scoped])

  const completedCount = useMemo(() => scoped.filter((t) => t.status?.is_terminal).length, [scoped])
  // Picking a specific status shows exactly that status (completed included);
  // otherwise the "Show completed" toggle decides.
  const visible = useMemo(() => {
    if (quick)
      return scoped.filter(
        (t) => !t.status?.is_terminal && getTaskDelay(t.due_date, t.completed_at).state === quick,
      )
    if (statusFilter) return scoped.filter((t) => t.status_id === statusFilter)
    return showCompleted ? scoped : scoped.filter((t) => !t.status?.is_terminal)
  }, [scoped, showCompleted, statusFilter, quick])
  const hasFilters = !!(
    assignorFilter ||
    assigneeFilter ||
    statusFilter ||
    groupFilter ||
    priorityFilter ||
    needle ||
    quick
  )
  function clearFilters() {
    setAssignorFilter('')
    setAssigneeFilter('')
    setStatusFilter('')
    setGroupFilter('')
    setPriorityFilter('')
    setSearch('')
    setQuick('')
  }

  // Bulk-assign rows (one task per assignee, shared bulk_key) collapse into a
  // single parent row in "All tasks" so the list doesn't repeat the same title
  // N times. "My tasks" stays flat because each person only sees their copy.
  const [expandedBulks, setExpandedBulks] = useState<Set<string>>(new Set())
  // Heading sort / per-column filter run on the task rows first; bulk groups
  // are then formed from whatever survives, in the sorted order.
  const controls = useTableControls(visible, {
    title: (t) => t.title,
    assignee: (t) => t.assignee?.full_name || t.assignee?.email || 'Unassigned',
    creator: (t) => t.creator?.full_name || t.creator?.email,
    created: (t) => t.created_at,
    completed: (t) => t.completed_at,
    priority: (t) => ({ low: 1, medium: 2, high: 3 })[t.priority as 'low' | 'medium' | 'high'] ?? 0,
    progress: (t) => t.progress_percent,
    status: (t) => styleForStatus(t.status?.slug).label,
    due: (t) => t.due_date,
  })
  const tableTasks = controls.rows
  const displayItems = useMemo<DisplayItem[]>(() => {
    if (filter !== 'all') return tableTasks.map((task) => ({ kind: 'single' as const, task }))
    const items: DisplayItem[] = []
    const seen = new Set<string>()
    for (const t of tableTasks) {
      if (t.bulk_key) {
        if (seen.has(t.bulk_key)) continue
        const siblings = tableTasks.filter((x) => x.bulk_key === t.bulk_key)
        if (siblings.length > 1) {
          items.push({ kind: 'bulk', key: t.bulk_key, tasks: siblings })
          seen.add(t.bulk_key)
          continue
        }
      }
      items.push({ kind: 'single', task: t })
    }
    return items
  }, [tableTasks, filter])
  function toggleBulk(key: string) {
    setExpandedBulks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Page-wise pagination — one UI row for a bulk group counts as one item.
  const pagination = usePagination(
    displayItems,
    25,
    `${filter}|${assignorFilter}|${assigneeFilter}|${statusFilter}|${groupFilter}|${priorityFilter}|${needle}|${quick}|${showCompleted}|${controls.stateKey}`,
  )
  const { pagedItems, pageStart } = pagination

  function renderTaskRow(t: TaskRow, isChild: boolean, serial: number | null) {
    return (
      <tr key={t.id} data-testid="task-row" data-child={isChild ? 'true' : undefined}>
        <Td
          className={cn(
            'sticky left-0 z-10 w-10 bg-white text-xs text-slate-400 tabular-nums',
            isChild && 'bg-slate-50',
          )}
        >
          {serial ?? ''}
        </Td>
        <Td
          className={cn(
            'sticky left-10 z-10 w-80 max-w-80 min-w-64 bg-white font-medium whitespace-normal text-slate-900',
            isChild && 'bg-slate-50 pl-10',
          )}
        >
          <div>{t.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-normal">
            {t.category?.name && (
              <span
                data-testid="task-group"
                className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-700"
              >
                <FolderOpen className="size-3" /> {t.category.name}
              </span>
            )}
            <Badge
              tone={PRIORITY_TONE[t.priority as keyof typeof PRIORITY_TONE]}
              data-testid="task-priority"
            >
              {t.priority}
            </Badge>
            {t.due_date && (
              <>
                <span
                  data-testid="task-due-date"
                  data-delay={getTaskDelay(t.due_date, t.completed_at).state}
                  className={dueDateClass(getTaskDelay(t.due_date, t.completed_at).state)}
                >
                  due {formatDate(t.due_date)}
                </span>
                <TaskDelayBadge dueDate={t.due_date} completedAt={t.completed_at} />
              </>
            )}
          </div>
          {t.description && !isChild && (
            <p
              data-testid="task-description"
              className="mt-1 line-clamp-2 text-xs font-normal whitespace-pre-line text-slate-600"
              title={t.description}
            >
              {t.description}
            </p>
          )}
          {t.remarks && !isChild && (
            <div
              data-testid="task-remark"
              className="mt-1 flex items-start gap-1 text-xs font-normal text-slate-500"
            >
              <MessageSquarePlus className="mt-0.5 size-3 shrink-0 text-slate-400" />
              <span className="italic">{t.remarks}</span>
            </div>
          )}
        </Td>
        <Td>
          <div data-testid="task-assignee">
            <PersonChip name={t.assignee?.full_name || t.assignee?.email || 'Unassigned'} />
          </div>
          <div className="mt-1 pl-8 text-xs whitespace-nowrap text-slate-500" data-testid="task-creator">
            by {t.creator?.full_name || t.creator?.email || '—'}
          </div>
        </Td>
        <Td className="whitespace-nowrap text-xs text-slate-500">
          <div data-testid="task-created-at">Created {formatDate(t.created_at)}</div>
          <div data-testid="task-completed-at" className={t.completed_at ? 'text-emerald-700' : ''}>
            {t.completed_at ? `Done ${formatDate(t.completed_at)}` : 'Not completed'}
          </div>
        </Td>
        <Td>
          <div className="flex items-center gap-2" data-testid="task-progress">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-brand-500 h-full rounded-full"
                style={{ width: `${t.progress_percent}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">{t.progress_percent}%</span>
          </div>
        </Td>
        <Td>
          <Badge
            className={styleForStatus(t.status?.slug).className}
            data-testid="task-status"
            data-status={t.status?.slug ?? ''}
          >
            {styleForStatus(t.status?.slug).label}
          </Badge>
        </Td>
        <Td
          className={cn(
            'sticky right-0 z-10 bg-white shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]',
            isChild && 'bg-slate-50',
          )}
        >
          <div className="flex w-36 flex-wrap items-center justify-end gap-1">
            <LifecycleActions task={t} userId={user!.id} canApproveAny={canManageStatuses} />
            <button
              data-testid="update-status-button"
              aria-label={`Update status of ${t.title}`}
              className="text-brand-600 hover:bg-brand-50 rounded-md px-2 py-1 text-xs font-medium"
              onClick={() => setStatusTask(t)}
            >
              Update
            </button>
            {(t.created_by === user!.id || canManageStatuses) && (
              <button
                data-testid="edit-task-button"
                aria-label={`Edit ${t.title}`}
                className="hover:text-brand-600 rounded-md p-1 text-slate-400"
                onClick={() => setEditTask(t)}
              >
                <Pencil className="size-4" />
              </button>
            )}
            <button
              data-testid="task-remark-button"
              aria-label={`Remarks for ${t.title}`}
              className="hover:text-brand-600 rounded-md p-1 text-slate-400"
              onClick={() => setRemarkTask(t)}
            >
              <MessageSquarePlus className="size-4" />
            </button>
            <button
              data-testid="task-history-button"
              aria-label={`History of ${t.title}`}
              className="rounded-md p-1 text-slate-400 hover:text-slate-700"
              onClick={() => setHistoryTask(t)}
            >
              <History className="size-4" />
            </button>
            {canManageStatuses && (
              <button
                data-testid="delete-task-button"
                aria-label={`Delete task ${t.title}`}
                className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => setConfirmDeleteTask(t)}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </Td>
      </tr>
    )
  }

  return (
    <div data-testid="tasks-page">
      <PageHeader
        title="Tasks"
        description="Create your own tasks or assign work. Status changes are tracked with history."
        actions={
          <div className="flex gap-2">
            {canManageStatuses && (
              <Button
                variant="outline"
                data-testid="manage-statuses-button"
                onClick={() => setManageOpen(true)}
              >
                <Settings2 className="size-4" /> Statuses
              </Button>
            )}
            <Button data-testid="new-task-button" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New task
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canViewAll && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(['mine', 'all'] as const).map((f) => (
              <button
                key={f}
                data-testid={`task-filter-${f}`}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium capitalize',
                  filter === f ? 'text-brand-700 bg-white shadow-sm' : 'text-slate-500',
                )}
              >
                {f === 'mine' ? 'My tasks' : 'All tasks'}
              </button>
            ))}
          </div>
        )}
        <button
          data-testid="toggle-completed"
          onClick={() => setShowCompleted((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
            showCompleted
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700',
          )}
        >
          {showCompleted ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showCompleted ? 'Hide completed' : `Show completed (${completedCount})`}
        </button>
        <button
          data-testid="toggle-group-project"
          onClick={() => setGroupBy((v) => (v === 'project' ? 'none' : 'project'))}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
            groupBy === 'project'
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700',
          )}
        >
          <FolderOpen className="size-3.5" />
          {groupBy === 'project' ? 'Ungroup' : 'Group by project'}
        </button>
        <ApprovalsSummary tasks={visible} userId={user?.id} />
        {user?.id && <CapacityCallout userId={user.id} />}
      </div>

      <TaskSummaryCards
        summary={summary}
        quick={quick}
        onQuick={(q) => {
          setQuick(q)
          setStatusFilter('')
        }}
        onShowCompleted={() => {
          setQuick('')
          setStatusFilter('')
          setShowCompleted(true)
        }}
        onShowOpen={() => {
          setQuick('')
          setStatusFilter('')
          setShowCompleted(false)
        }}
      />

      <div
        className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        data-testid="task-filter-bar"
      >
        <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
          <Label htmlFor="task-search" className="text-xs text-slate-500">
            Search
          </Label>
          <Input
            id="task-search"
            data-testid="task-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Task title or description"
            className="h-9"
          />
        </div>
        <div>
          <Label htmlFor="task-group-filter" className="text-xs text-slate-500">
            Task group
          </Label>
          <Select
            id="task-group-filter"
            data-testid="task-group-filter"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="h-9"
          >
            <option value="">All groups</option>
            {taskGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="__none">No group</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="task-status-filter" className="text-xs text-slate-500">
            Status
          </Label>
          <Select
            id="task-status-filter"
            data-testid="task-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setQuick('')
            }}
            className="h-9"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="task-priority-filter" className="text-xs text-slate-500">
            Priority
          </Label>
          <Select
            id="task-priority-filter"
            data-testid="task-priority-filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-9"
          >
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="task-assignor-filter" className="text-xs text-slate-500">
            Assigned by
          </Label>
          <Select
            id="task-assignor-filter"
            data-testid="task-assignor-filter"
            value={assignorFilter}
            onChange={(e) => setAssignorFilter(e.target.value)}
            className="h-9"
          >
            <option value="">Anyone</option>
            {assignors.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="task-assignee-filter" className="text-xs text-slate-500">
            Assigned to
          </Label>
          <Select
            id="task-assignee-filter"
            data-testid="task-assignee-filter"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-9"
          >
            <option value="">Anyone</option>
            {assignees.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <div className="flex items-end sm:col-span-2 lg:col-span-4 xl:col-span-7">
            <button
              data-testid="clear-task-filters"
              className="text-brand-600 text-xs font-medium hover:underline"
              onClick={clearFilters}
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {!isLoading && visible.length === 0 ? (
        <EmptyState
          title={
            hasFilters
              ? 'No tasks match these filters'
              : scoped.length > 0
                ? 'No open tasks'
                : 'No tasks yet'
          }
          description={
            hasFilters
              ? 'Change or clear the filters to see more tasks.'
              : scoped.length > 0
                ? 'All tasks here are completed. Use "Show completed" to see them.'
                : 'Create your first task.'
          }
          testid="tasks-empty"
        />
      ) : (
        <Table data-testid="tasks-table">
          <Thead>
            <tr>
              <Th className="sticky left-0 z-20 w-10 bg-slate-50">S.No</Th>
              <SortFilterTh controls={controls} k="title" className="left-10 z-20">
                Task
              </SortFilterTh>
              <SortFilterTh controls={controls} k="assignee">Assigned to / by</SortFilterTh>
              <SortFilterTh controls={controls} k="created" filterable={false}>Dates</SortFilterTh>
              <SortFilterTh controls={controls} k="progress" filterable={false}>Progress</SortFilterTh>
              <SortFilterTh controls={controls} k="status">Status</SortFilterTh>
              <Th className="sticky right-0 z-20 w-px bg-slate-50 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]" />
            </tr>
          </Thead>
          <Tbody>
            {pagedItems.flatMap((item, idx) => {
              const serial = pageStart + idx + 1
              if (item.kind === 'single') {
                return [renderTaskRow(item.task, false, serial)]
              }
              const expanded = expandedBulks.has(item.key)
              const first = item.tasks[0]
              const total = item.tasks.length
              const done = item.tasks.filter((t) => t.status?.is_terminal).length
              const names = item.tasks
                .map((t) => t.assignee?.full_name || t.assignee?.email || '—')
                .filter((n): n is string => Boolean(n))
              const preview = names.slice(0, 5).join(', ')
              const moreCount = Math.max(0, names.length - 5)
              return [
                <tr
                  key={`bulk-${item.key}`}
                  data-testid="task-bulk-row"
                  data-bulk-key={item.key}
                  className="bg-slate-50"
                >
                  <Td className="sticky left-0 z-10 w-10 bg-slate-50 text-xs text-slate-500 tabular-nums">
                    {serial}
                  </Td>
                  <Td
                    className="sticky left-10 z-10 bg-slate-50 font-medium text-slate-900"
                    colSpan={2}
                  >
                    <button
                      type="button"
                      data-testid="toggle-bulk"
                      onClick={() => toggleBulk(item.key)}
                      className="hover:text-brand-600 flex items-center gap-2 text-left"
                    >
                      {expanded ? (
                        <ChevronDown className="size-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-4 text-slate-400" />
                      )}
                      <span>{first.title}</span>
                      <Badge tone="blue" className="gap-1">
                        <UsersIcon className="size-3" /> {total} people
                      </Badge>
                    </button>
                    <div className="mt-1 ml-6 flex flex-wrap items-center gap-1.5 text-xs font-normal">
                      {first.category?.name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-700">
                          <FolderOpen className="size-3" /> {first.category.name}
                        </span>
                      )}
                      <Badge tone={PRIORITY_TONE[first.priority as keyof typeof PRIORITY_TONE]}>
                        {first.priority}
                      </Badge>
                    </div>
                    {first.due_date && (
                      <div className="mt-0.5 ml-6 flex flex-wrap items-center gap-1.5 text-xs font-normal">
                        <span
                          data-delay={getTaskDelay(first.due_date, first.completed_at).state}
                          className={dueDateClass(getTaskDelay(first.due_date, first.completed_at).state)}
                        >
                          due {formatDate(first.due_date)}
                        </span>
                      </div>
                    )}
                    <div className="mt-1 ml-6 text-xs font-normal text-slate-500">
                      {preview}
                      {moreCount > 0 && ` +${moreCount} more`}
                    </div>
                    {first.remarks && (
                      <div className="mt-1 ml-6 flex items-start gap-1 text-xs font-normal text-slate-500">
                        <MessageSquarePlus className="mt-0.5 size-3 shrink-0 text-slate-400" />
                        <span className="italic">{first.remarks}</span>
                      </div>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    Created {formatDate(first.created_at)}
                    <div>by {first.creator?.full_name || first.creator?.email || '—'}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    {done}/{total} completed
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">
                      {expanded ? 'Expanded' : 'Click to expand'}
                    </span>
                  </Td>
                  <Td className="sticky right-0 z-10 bg-slate-50 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]">
                    <div className="flex justify-end gap-1">
                      {(first.created_by === user!.id || canManageStatuses) && (
                        <button
                          data-testid="edit-bulk-task-button"
                          aria-label={`Edit ${first.title} (bulk)`}
                          className="hover:text-brand-600 rounded-md p-1 text-slate-400"
                          onClick={() => setEditTask(first)}
                          title="Edit the shared task template (does not change individual assignee state)"
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>,
                ...(expanded ? item.tasks.map((t) => renderTaskRow(t, true, null)) : []),
              ]
            })}
          </Tbody>
        </Table>
      )}

      <Pagination {...pagination} testid="tasks-pagination" />

      {newOpen && (
        <NewTaskModal onClose={() => setNewOpen(false)} canAssign={canAssign} userId={user!.id} />
      )}
      {statusTask && <StatusModal task={statusTask} onClose={() => setStatusTask(null)} />}
      {editTask && (
        <EditTaskModal task={editTask} onClose={() => setEditTask(null)} canAssign={canAssign} />
      )}
      {remarkTask && <RemarkModal task={remarkTask} onClose={() => setRemarkTask(null)} />}
      {historyTask && <HistoryModal task={historyTask} onClose={() => setHistoryTask(null)} />}
      {manageOpen && <StatusMasterModal onClose={() => setManageOpen(false)} />}
      {confirmDeleteTask && (
        <ConfirmDialog
          title="Delete task"
          testid="delete-task-dialog"
          confirmLabel="Delete task"
          loading={deleteTask.isPending}
          onClose={() => setConfirmDeleteTask(null)}
          message={
            <p>
              Delete task{' '}
              <span className="font-semibold text-slate-900">{confirmDeleteTask.title}</span>? Its
              remarks and status history will be deleted too. This action cannot be undone.
            </p>
          }
          onConfirm={() =>
            deleteTask.mutate(confirmDeleteTask.id, {
              onSuccess: () => {
                toast.success('Task deleted')
                setConfirmDeleteTask(null)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
    </div>
  )
}

function NewTaskModal({
  onClose,
  canAssign,
  userId,
}: {
  onClose: () => void
  canAssign: boolean
  userId: string
}) {
  const create = useCreateTask()
  const toast = useToast()
  const { data: statuses = [] } = useTaskStatuses()
  // Colleague directory: employees with tasks.assign can pick anyone active.
  const { data: users = [] } = useActivePeople()
  const { data: categories = [] } = useTaskCategories()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  // Multi-assign: managers can pick one or more employees, and may include
  // themselves ("Self assignment also" — meeting Nov 2026). Non-managers only
  // ever create self-tasks, so the picker is hidden for them.
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(
    canAssign ? new Set() : new Set([userId]),
  )
  const [dueDate, setDueDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const sortedUsers = useMemo(
    () => users.slice().sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
    [users],
  )
  const singleAssignee = assigneeIds.size === 1 ? [...assigneeIds][0] : null
  const { data: assigneeOpen = 0 } = useOpenTaskCount(singleAssignee)
  const { data: assigneeCap = 25 } = useEffectiveCapacity(singleAssignee)
  const overCap =
    !!singleAssignee && singleAssignee !== userId && assigneeOpen >= assigneeCap

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal open onClose={onClose} title="New task" testid="task-modal">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const firstStatus = statuses[0]?.id
          if (!firstStatus) return
          if (!categoryId) {
            toast.error('Pick a task group', 'Choose which group this task belongs to.')
            return
          }
          if (canAssign && assigneeIds.size === 0) {
            toast.error('Pick at least one assignee', 'Choose who this task is for.')
            return
          }
          // One task per assignee — keeps capacity, approvals and ownership
          // per-user. For a single assignee this is identical to the old flow.
          // A shared bulk_key ties the rows together so the UI can collapse
          // them into one expandable row in All Tasks.
          const targets = canAssign ? [...assigneeIds] : [userId]
          const bulkKey = targets.length > 1 ? crypto.randomUUID() : null
          try {
            await Promise.all(
              targets.map((assigneeId) =>
                create.mutateAsync({
                  title: title.trim(),
                  assigneeId,
                  statusId: firstStatus,
                  priority,
                  dueDate: dueDate || null,
                  createdBy: userId,
                  remarks,
                  description: description.trim() || undefined,
                  categoryId: categoryId || null,
                  bulkKey,
                }),
              ),
            )
            toast.success(
              targets.length === 1 ? 'Task created' : `Tasks created for ${targets.length} people`,
            )
            onClose()
          } catch (err) {
            toast.error('Could not create task', (err as Error).message)
          }
        }}
      >
        <div>
          <Label htmlFor="task-title">Task</Label>
          <Input
            id="task-title"
            data-testid="task-title-input"
            placeholder="What is the task?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
            data-testid="task-description-input"
            rows={3}
            placeholder="What needs to be done, steps, expected output…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="task-created">Date of creation</Label>
            <Input
              id="task-created"
              data-testid="task-created-input"
              type="date"
              value={new Date().toLocaleDateString('en-CA')}
              readOnly
              disabled
            />
          </div>
          <div>
            <Label htmlFor="task-priority">Priority</Label>
            <Select
              id="task-priority"
              data-testid="task-priority-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="task-due">Due date</Label>
            <Input
              id="task-due"
              data-testid="task-due-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            {dueDate && <p className="mt-1 text-xs text-slate-400">Due {formatDate(dueDate)}</p>}
          </div>
          <div>
            <Label htmlFor="task-category">Task Group *</Label>
            <Select
              id="task-category"
              data-testid="task-category-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">Select a group…</option>
              {categories
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </Select>
            {categories.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                No task groups yet — ask an admin to create one in Masters.
              </p>
            )}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="mb-0">Assignees</Label>
            {canAssign && (
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-brand-600 hover:underline"
                  onClick={() => setAssigneeIds(new Set(sortedUsers.map((u) => u.id)))}
                  data-testid="assignees-select-all"
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-slate-500 hover:underline"
                  onClick={() => setAssigneeIds(new Set())}
                  data-testid="assignees-clear"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {!canAssign ? (
            <p className="text-sm text-slate-600">
              This task will be assigned to you. Only managers can assign to others.
            </p>
          ) : (
            <div
              className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2"
              data-testid="task-assignee-list"
            >
              {sortedUsers.map((u) => {
                const isSelf = u.id === userId
                const checked = assigneeIds.has(u.id)
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      checked={checked}
                      onChange={() => toggleAssignee(u.id)}
                      data-testid={`task-assignee-opt-${u.email}`}
                    />
                    <span className="text-sm text-slate-700">
                      {u.full_name || u.email}
                      {isSelf && <span className="ml-1 text-xs text-slate-400">(myself)</span>}
                    </span>
                  </label>
                )
              })}
              {sortedUsers.length === 0 && (
                <p className="px-1 py-2 text-xs text-slate-400">No employees found.</p>
              )}
            </div>
          )}
          {canAssign && assigneeIds.size > 1 && (
            <p className="mt-1 text-xs text-slate-500" data-testid="bulk-assign-hint">
              {assigneeIds.size} employees selected — one task will be created for each.
            </p>
          )}
          {singleAssignee && singleAssignee !== userId && (
            <p
              data-testid="assignee-capacity-hint"
              className={cn(
                'mt-1 text-xs',
                overCap ? 'font-medium text-red-600' : 'text-slate-500',
              )}
            >
              Open tasks: {assigneeOpen} / capacity {assigneeCap}
              {overCap && ' — they are already at or over capacity. Assign anyway?'}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="task-remarks">Remarks</Label>
          <Textarea
            id="task-remarks"
            data-testid="task-remarks-input"
            rows={2}
            placeholder="Optional notes about this task"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="create-task-submit" loading={create.isPending}>
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditTaskModal({
  task,
  onClose,
  canAssign,
}: {
  task: TaskRow
  onClose: () => void
  canAssign: boolean
}) {
  const update = useUpdateTask()
  const toast = useToast()
  const { data: users = [] } = useActivePeople()
  const { data: categories = [] } = useTaskCategories()
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(
    (task.priority as 'low' | 'medium' | 'high') ?? 'medium',
  )
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? task.created_by)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [categoryId, setCategoryId] = useState(task.category_id ?? '')
  const [remarks, setRemarks] = useState(task.remarks ?? '')
  const [description, setDescription] = useState(task.description ?? '')

  return (
    <Modal open onClose={onClose} title={`Edit: ${task.title}`} testid="edit-task-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) {
            toast.error('Title required')
            return
          }
          update.mutate(
            {
              taskId: task.id,
              createdBy: task.created_by,
              patch: {
                title,
                priority,
                dueDate: dueDate || null,
                assigneeId: assigneeId || task.created_by,
                categoryId: categoryId || null,
                remarks,
                description,
              },
            },
            {
              onSuccess: () => {
                toast.success('Task updated')
                onClose()
              },
              onError: (err) => toast.error('Update failed', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="edit-task-title">Task</Label>
          <Input
            id="edit-task-title"
            data-testid="edit-task-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="edit-task-description">Description</Label>
          <Textarea
            id="edit-task-description"
            data-testid="edit-task-description-input"
            rows={3}
            placeholder="What needs to be done, steps, expected output…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-task-priority">Priority</Label>
            <Select
              id="edit-task-priority"
              data-testid="edit-task-priority-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-task-due">Due date</Label>
            <Input
              id="edit-task-due"
              data-testid="edit-task-due-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-task-category">Task Group</Label>
            <Select
              id="edit-task-category"
              data-testid="edit-task-category-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— None —</option>
              {categories
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
          {canAssign && (
            <div>
              <Label htmlFor="edit-task-assignee">Assignee</Label>
              <Select
                id="edit-task-assignee"
                data-testid="edit-task-assignee-select"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                {users
                  .slice()
                  .sort((a, b) =>
                    (a.full_name || a.email).localeCompare(b.full_name || b.email),
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email}
                      {u.id === task.created_by ? ' (creator)' : ''}
                    </option>
                  ))}
              </Select>
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="edit-task-remarks">Remarks</Label>
          <Textarea
            id="edit-task-remarks"
            data-testid="edit-task-remarks-input"
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="save-task-edit" loading={update.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RemarkModal({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const addRemark = useAddTaskRemark()
  const { data: remarkHistory = [], isLoading } = useTaskRemarks(task.id)
  const toast = useToast()
  const [remarks, setRemarks] = useState('')

  return (
    <Modal open onClose={onClose} title={`Remarks: ${task.title}`} testid="remark-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!remarks.trim()) return
          addRemark.mutate(
            { taskId: task.id, body: remarks },
            {
              onSuccess: () => {
                toast.success('Remark added')
                setRemarks('')
              },
              onError: (err) => toast.error('Save failed', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="task-remark-text">Add a remark</Label>
          <Textarea
            id="task-remark-text"
            data-testid="task-remark-textarea"
            rows={3}
            placeholder="Add a remark visible to the task owner, assignee and managers"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            type="submit"
            data-testid="save-remark-submit"
            disabled={!remarks.trim()}
            loading={addRemark.isPending}
          >
            Add remark
          </Button>
        </div>
      </form>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Remark history
        </h4>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : remarkHistory.length === 0 ? (
          <p className="text-sm text-slate-400" data-testid="remark-history-empty">
            No remarks yet.
          </p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto" data-testid="remark-history">
            {remarkHistory.map((r) => (
              <li
                key={r.id}
                data-testid="remark-entry"
                className="border-l-2 border-slate-200 pl-3 text-sm"
              >
                <div className="text-xs text-slate-500">
                  {r.author?.full_name || r.author?.email || 'Unknown'} ·{' '}
                  {formatDateTime(r.created_at)}
                </div>
                <div className="whitespace-pre-wrap text-slate-700">{r.body}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

function TaskDelayBadge({
  dueDate,
  completedAt,
}: {
  dueDate: string | null
  completedAt: string | null
}) {
  const delay = getTaskDelay(dueDate, completedAt)
  if (!['overdue', 'due_today', 'completed_late'].includes(delay.state)) return null

  return (
    <Badge tone={delay.isDelayed ? 'red' : 'amber'} data-testid="task-delay-status">
      {delay.label}
    </Badge>
  )
}

function StatusModal({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const { data: statuses = [] } = useTaskStatuses()
  const update = useUpdateTaskStatus()
  const updateDueDate = useUpdateTaskDueDate()
  const updateProgress = useUpdateTaskProgress()
  const toast = useToast()
  const [statusId, setStatusId] = useState(task.status_id)
  const [progress, setProgress] = useState(task.progress_percent)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [remarks, setRemarks] = useState('')
  const completing = !!statuses.find((s) => s.id === statusId)?.is_terminal
  const completingLate =
    completing &&
    statusId !== task.status_id &&
    getTaskDelay(dueDate, new Date().toISOString()).isDelayed

  return (
    <Modal open onClose={onClose} title={`Update: ${task.title}`} testid="status-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void (async () => {
            try {
              const newDue = dueDate || null
              const dueChanged = newDue !== (task.due_date ?? null)
              const statusChanged = statusId !== task.status_id
              if (completingLate && !remarks.trim()) {
                toast.error('Delay comment required', 'Explain why this task was completed late.')
                return
              }
              if (dueChanged) {
                await updateDueDate.mutateAsync({ taskId: task.id, dueDate: newDue })
              }
              if (statusChanged || remarks.trim()) {
                await update.mutateAsync({
                  taskId: task.id,
                  statusId,
                  remarks: remarks.trim() || undefined,
                })
              }
              // A completed status sets 100% on the server; otherwise save the user's value.
              if (!completing && progress !== task.progress_percent) {
                await updateProgress.mutateAsync({ taskId: task.id, percent: progress })
              }
              toast.success('Task updated')
              onClose()
            } catch (err) {
              toast.error('Update failed', (err as Error).message)
            }
          })()
        }}
      >
        <div>
          <Label htmlFor="status-select">New status</Label>
          <Select
            id="status-select"
            data-testid="status-select"
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="status-progress">Completion: {completing ? 100 : progress}%</Label>
          <input
            id="status-progress"
            data-testid="status-progress"
            type="range"
            min={0}
            max={100}
            step={5}
            value={completing ? 100 : progress}
            disabled={completing}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="accent-brand-600 w-full"
          />
          {completing && (
            <p className="mt-1 text-xs text-slate-400">A completed task is always 100%.</p>
          )}
        </div>
        <div>
          <Label htmlFor="status-due-date">Due date</Label>
          <Input
            id="status-due-date"
            data-testid="status-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            {dueDate ? `Due ${formatDate(dueDate)}. ` : ''}The assignee, creator or a task manager
            can change the due date.
          </p>
        </div>
        <div>
          <Label htmlFor="status-remarks">{completingLate ? 'Delay comment' : 'Remarks'}</Label>
          <Textarea
            id="status-remarks"
            data-testid="status-remarks"
            rows={2}
            required={completingLate}
            placeholder={completingLate ? 'Explain the reason for the delay' : undefined}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          {completingLate && (
            <p className="mt-1 text-xs text-red-600">
              This task is past its due date. A delay comment is required before completion.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="save-status-submit"
            loading={update.isPending || updateDueDate.isPending || updateProgress.isPending}
          >
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function HistoryModal({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const { data: history = [], isLoading } = useTaskHistory(task.id)
  const { data: planning = [], isLoading: planningLoading } = useTaskPlanning(task.id)
  return (
    <Modal open onClose={onClose} title={`History: ${task.title}`} testid="history-modal">
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status history
          </h3>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-400">No status changes yet.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li
                  key={h.id}
                  data-testid="history-entry"
                  className="border-brand-200 border-l-2 pl-3"
                >
                  <p className="text-sm font-medium text-slate-800">
                    {h.from_status?.name ? `${h.from_status.name} → ` : ''}
                    {h.to_status?.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {h.changer?.full_name || 'System'} · {formatDateTime(h.created_at)}
                  </p>
                  {h.remarks && <p className="mt-0.5 text-sm text-slate-600">{h.remarks}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Planning updates
          </h3>
          {planningLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : planning.length === 0 ? (
            <p className="text-sm text-slate-400">
              No planning slots have been linked to this task yet.
            </p>
          ) : (
            <ul className="space-y-3" data-testid="planning-history">
              {planning.map((s) => {
                const win =
                  s.start_time && s.end_time
                    ? `${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`
                    : null
                return (
                  <li
                    key={s.id}
                    data-testid="planning-entry"
                    className="border-brand-200 border-l-2 pl-3"
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {formatDate(s.plan_date)}
                      {win && <span className="ml-2 text-xs font-normal text-slate-500">{win}</span>}
                      {typeof s.progress === 'number' && (
                        <Badge tone="blue" className="ml-2">
                          {s.progress}%
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.user?.full_name || s.user?.email || 'Unknown'}
                      {s.task_name && s.task_name !== task.title && (
                        <span className="ml-1 italic text-slate-400">— {s.task_name}</span>
                      )}
                    </p>
                    {s.remarks && (
                      <p className="mt-0.5 text-sm text-slate-600">{s.remarks}</p>
                    )}
                    {s.challenges && (
                      <p className="mt-0.5 text-sm text-amber-700">
                        Challenge: {s.challenges}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}

function StatusMasterModal({ onClose }: { onClose: () => void }) {
  const { data: statuses = [] } = useTaskStatuses()
  const create = useCreateStatus()
  const del = useDeleteStatus()
  const { data: policy } = useTaskPolicy()
  const updatePolicy = useUpdateTaskPolicy()
  const toast = useToast()
  const [name, setName] = useState('')
  const [defaultCapDraft, setDefaultCapDraft] = useState<string | null>(null)
  const defaultCap =
    defaultCapDraft ?? (policy?.default_task_capacity != null ? String(policy.default_task_capacity) : '')

  return (
    <Modal open onClose={onClose} title="Task statuses & policy" testid="status-master-modal">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Label htmlFor="task-default-cap">Default task capacity (new users)</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="task-default-cap"
              data-testid="task-default-capacity"
              type="number"
              min="1"
              value={defaultCap}
              onChange={(e) => setDefaultCapDraft(e.target.value)}
              className="w-32"
            />
            <Button
              size="sm"
              variant="outline"
              data-testid="save-default-capacity"
              loading={updatePolicy.isPending}
              onClick={() => {
                const n = Math.max(1, Math.round(Number(defaultCap)))
                updatePolicy.mutate(
                  { default_task_capacity: n },
                  {
                    onSuccess: () => toast.success('Default capacity saved'),
                    onError: (err: unknown) => toast.error('Save failed', (err as Error).message),
                  },
                )
              }}
            >
              Save
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            A user with no per-user capacity set uses this value. Edit a user to override it.
          </p>
        </div>
        <ul className="space-y-1">
          {statuses.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <span>{s.name}</span>
              {s.is_system ? (
                <Badge tone="slate">system</Badge>
              ) : (
                <button
                  aria-label={`Delete ${s.name}`}
                  className="text-slate-400 hover:text-red-600"
                  onClick={() =>
                    del.mutate(s.id, {
                      onError: (e) => toast.error('Delete failed', (e as Error).message),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              {
                name: name.trim(),
                slug: name
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '_'),
                sortOrder: statuses.length + 1,
              },
              {
                onSuccess: () => {
                  toast.success('Status added')
                  setName('')
                },
                onError: (err) => toast.error('Could not add', (err as Error).message),
              },
            )
          }}
        >
          <Input
            data-testid="new-status-name"
            placeholder="New status name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button type="submit" data-testid="create-status-submit" loading={create.isPending}>
            Add
          </Button>
        </form>
      </div>
    </Modal>
  )
}

/* -----------------------------------------------------------------------------
 * Lifecycle action cell
 * Accept/Reject (assignee, pending), Start, Submit for approval, Resubmit,
 * Approve / Send back (approver, awaiting_approval). Rendered inline so each
 * state has exactly the right call-to-action right next to the task.
 * -------------------------------------------------------------------------- */

function LifecycleActions({
  task,
  userId,
  canApproveAny,
}: {
  task: TaskRow
  userId: string
  canApproveAny: boolean
}) {
  const [reasonModal, setReasonModal] = useState<null | 'reject' | 'rework'>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const toast = useToast()
  const accept = useAcceptTask()
  const reject = useRejectTask()
  const start = useStartTask()
  const submit = useSubmitTask()
  const approve = useApproveTask()
  const rework = useReworkTask()

  const actions = availableActions(task, {
    userId,
    canApproveAny,
    reportingManagerId: null,
  })

  function okWarn(res: { warning?: string | null }) {
    if (res.warning) toast.error('Capacity warning', res.warning)
    else toast.success('Done')
  }
  function fail(err: unknown) {
    toast.error('Could not update task', (err as Error).message)
  }

  const btn = (
    label: string,
    testid: string,
    icon: React.ReactNode,
    onClick: () => void,
    tone: 'brand' | 'red' | 'amber' | 'emerald' = 'brand',
  ) => {
    const tones: Record<string, string> = {
      brand: 'text-brand-600 hover:bg-brand-50',
      red: 'text-red-600 hover:bg-red-50',
      amber: 'text-amber-700 hover:bg-amber-50',
      emerald: 'text-emerald-700 hover:bg-emerald-50',
    }
    return (
      <button
        data-testid={testid}
        onClick={onClick}
        className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', tones[tone])}
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <>
      {actions.canAccept &&
        btn(
          'Accept',
          'task-accept',
          <Check className="size-3.5" />,
          () =>
            accept.mutate(
              { taskId: task.id },
              { onSuccess: (r) => okWarn(r), onError: fail },
            ),
          'emerald',
        )}
      {actions.canReject &&
        btn('Reject', 'task-reject', <X className="size-3.5" />, () => setReasonModal('reject'), 'red')}
      {actions.canStart &&
        btn(
          'Start',
          'task-start',
          <Send className="size-3.5" />,
          () => start.mutate(task.id, { onError: fail }),
        )}
      {(actions.canSubmit || actions.canResubmit) &&
        btn(
          actions.canResubmit ? 'Resubmit' : task.created_by === task.assignee_id ? 'Mark done' : 'Submit for approval',
          'task-submit',
          <CheckCheck className="size-3.5" />,
          () => setConfirmSubmit(true),
          'amber',
        )}
      {actions.canApprove &&
        btn(
          'Approve',
          'task-approve',
          <Check className="size-3.5" />,
          () =>
            approve.mutate(
              { taskId: task.id },
              {
                onSuccess: () => toast.success('Task approved'),
                onError: fail,
              },
            ),
          'emerald',
        )}
      {actions.canRework &&
        btn(
          'Send back',
          'task-rework',
          <Undo2 className="size-3.5" />,
          () => setReasonModal('rework'),
          'amber',
        )}

      {reasonModal && (
        <ReasonModal
          title={reasonModal === 'reject' ? 'Reject assignment' : 'Send task back for rework'}
          label={reasonModal === 'reject' ? 'Why are you declining this task?' : 'What needs changing?'}
          confirmLabel={reasonModal === 'reject' ? 'Reject' : 'Send back'}
          loading={reject.isPending || rework.isPending}
          onClose={() => setReasonModal(null)}
          onConfirm={(reason) => {
            const action = reasonModal === 'reject' ? reject : rework
            action.mutate(
              { taskId: task.id, reason },
              {
                onSuccess: () => {
                  toast.success(reasonModal === 'reject' ? 'Assignment rejected' : 'Sent back for rework')
                  setReasonModal(null)
                },
                onError: fail,
              },
            )
          }}
        />
      )}

      {confirmSubmit && (
        <ReasonModal
          title={task.created_by === task.assignee_id ? 'Mark task as done' : 'Submit for approval'}
          label="Add a note (optional)"
          confirmLabel={task.created_by === task.assignee_id ? 'Mark done' : 'Submit'}
          required={false}
          loading={submit.isPending}
          onClose={() => setConfirmSubmit(false)}
          onConfirm={(remarks) =>
            submit.mutate(
              { taskId: task.id, remarks },
              {
                onSuccess: (r) => {
                  toast.success(
                    r.status === 'completed' ? 'Task completed' : 'Submitted — awaiting approval',
                  )
                  setConfirmSubmit(false)
                },
                onError: fail,
              },
            )
          }
        />
      )}
    </>
  )
}

function ReasonModal({
  title,
  label,
  confirmLabel,
  loading = false,
  required = true,
  onClose,
  onConfirm,
}: {
  title: string
  label: string
  confirmLabel: string
  loading?: boolean
  required?: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal open onClose={onClose} title={title} testid="task-reason-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (required && !reason.trim()) return
          onConfirm(reason.trim())
        }}
      >
        <div>
          <Label htmlFor="task-reason">{label}</Label>
          <Textarea
            id="task-reason"
            data-testid="task-reason-input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={required}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="task-reason-submit" loading={loading} disabled={required && !reason.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* -----------------------------------------------------------------------------
 * Approvals summary chip (shows how many tasks need THIS user's approval)
 * -------------------------------------------------------------------------- */
function ApprovalsSummary({ tasks, userId }: { tasks: TaskRow[]; userId: string | undefined }) {
  if (!userId) return null
  const owed = tasks.filter(
    (t) =>
      t.status?.slug === 'awaiting_approval' &&
      t.assignee_id !== userId &&
      (t.created_by === userId /* approver fallback — reporting-manager link lives on profiles */),
  ).length
  if (!owed) return null
  return (
    <span
      data-testid="approvals-owed"
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
    >
      <CheckCheck className="size-3.5" /> {owed} awaiting your approval
    </span>
  )
}

/* -----------------------------------------------------------------------------
 * Capacity callout — tells the user whether they're over cap and what to do.
 * -------------------------------------------------------------------------- */
function CapacityCallout({ userId }: { userId: string }) {
  const { data: open = 0 } = useOpenTaskCount(userId)
  const { data: cap = 25 } = useEffectiveCapacity(userId)
  if (open <= cap) return null
  return (
    <span
      data-testid="capacity-callout"
      className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
    >
      {open} open · capacity {cap} — close some before planning
    </span>
  )
}

/** Initials avatar + name, used for assignee / assigner cells. */
function PersonChip({ name, muted }: { name: string; muted?: boolean }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
          muted ? 'bg-slate-100 text-slate-500' : 'bg-brand-100 text-brand-700',
        )}
      >
        {initials || '—'}
      </span>
      <span className={muted ? 'text-slate-500' : 'text-slate-800'}>{name}</span>
    </span>
  )
}

function TaskSummaryCards({
  summary,
  quick,
  onQuick,
  onShowCompleted,
  onShowOpen,
}: {
  summary: { open: number; overdue: number; dueToday: number; done: number }
  quick: '' | 'overdue' | 'due_today'
  onQuick: (q: '' | 'overdue' | 'due_today') => void
  onShowCompleted: () => void
  onShowOpen: () => void
}) {
  const cards = [
    {
      key: 'open',
      label: 'Open tasks',
      value: summary.open,
      tone: 'border-brand-200 bg-brand-50 text-brand-800',
      active: quick === '',
      onClick: onShowOpen,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: summary.overdue,
      tone: 'border-red-200 bg-red-50 text-red-800',
      active: quick === 'overdue',
      onClick: () => onQuick(quick === 'overdue' ? '' : 'overdue'),
    },
    {
      key: 'due_today',
      label: 'Due today',
      value: summary.dueToday,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      active: quick === 'due_today',
      onClick: () => onQuick(quick === 'due_today' ? '' : 'due_today'),
    },
    {
      key: 'done',
      label: 'Completed',
      value: summary.done,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      active: false,
      onClick: onShowCompleted,
    },
  ]
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="task-summary">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          data-testid={`task-summary-${c.key}`}
          onClick={c.onClick}
          className={cn(
            'rounded-xl border px-4 py-3 text-left transition hover:shadow-sm',
            c.tone,
            c.active && c.key !== 'open' && 'ring-2 ring-offset-1 ring-current',
          )}
        >
          <div className="text-2xl font-bold tabular-nums">{c.value}</div>
          <div className="text-xs font-medium opacity-80">{c.label}</div>
        </button>
      ))}
    </div>
  )
}
