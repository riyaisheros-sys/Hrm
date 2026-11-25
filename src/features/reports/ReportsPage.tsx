import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, X } from 'lucide-react'
import { REPORT_LABELS, useAllowedReportFields, useReport, type ReportType } from './hooks'
import { exportExcel, exportPdf, type CellFill, type ExtraTable } from './export'
import { ATTENDANCE_STATUS, LEGEND, SUNDAY_META } from '@/features/attendance/status'
import { Badge } from '@/components/ui/Badge'
import { useUsers } from '@/features/admin/users/hooks'
import { useTaskCategories } from '@/features/tasks/hooks'
import { ColumnChips } from '@/components/ui/ColumnChips'
import { useColumnConfig } from '@/lib/useColumnConfig'
import { usePersistedState } from '@/lib/usePersistedState'
import { StickyHeader } from '@/components/ui/StickyHeader'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatLateBy } from '@/features/planning/late'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'

const TYPES: ReportType[] = [
  'attendance',
  'leave',
  'salary',
  'task',
  'appraisal',
  'planning',
  'planning_lock',
  'recruitment',
  'communication',
  'documents',
  'assets',
  'lifecycle',
  'helpdesk',
  'visitors',
  'meetings',
  'training',
  'policies',
  'workflows',
]

// Attendance rows carry _status/_sunday hints: the status cell takes the status
// colour and Sunday rows are shaded, on screen and in the PDF alike.
const attendanceFill: CellFill = (row, key) => {
  const meta = ATTENDANCE_STATUS[String(row._status ?? '')]
  if (key === 'status' && meta) return meta.rgb
  return row._sunday ? SUNDAY_META.rgb : undefined
}

// Late planning entries (a discipline flag) are shaded red, on screen and in
// the PDF; the Entry Timing cell itself is a stronger red.
const LATE_ROW: [number, number, number] = [254, 226, 226]
const LATE_CELL: [number, number, number] = [252, 165, 165]
const planningFill: CellFill = (row, key) =>
  row._late ? (key === 'entry' ? LATE_CELL : LATE_ROW) : undefined
const planningExtraFill: CellFill = (row, key) =>
  row._late ? (key === 'timing' ? LATE_CELL : LATE_ROW) : undefined

export function ReportsPage() {
  // Reports filters persist across refresh so admins keep their last choice.
  const [type, setType] = usePersistedState<ReportType>('hrms-reports:type', 'attendance')
  const [from, setFrom] = usePersistedState('hrms-reports:from', '')
  const [to, setTo] = usePersistedState('hrms-reports:to', '')
  const [userId, setUserId] = usePersistedState('hrms-reports:user', '')
  const [status, setStatus] = usePersistedState('hrms-reports:status', '')
  const [category, setCategory] = usePersistedState('hrms-reports:category', '')
  const [priority, setPriority] = usePersistedState('hrms-reports:priority', '')
  const [taskType, setTaskType] = usePersistedState('hrms-reports:taskType', '')
  const [taskSearch, setTaskSearch] = usePersistedState('hrms-reports:taskSearch', '')
  const [dateField, setDateField] = usePersistedState<'created' | 'planning'>(
    'hrms-reports:dateField',
    'created',
  )
  const [sort, setSort] = usePersistedState<{ key: string; dir: 'asc' | 'desc' } | null>(
    'hrms-reports:sort',
    null,
  )
  const [detail, setDetail] = useState<DetailView | null>(null)
  const { data: users = [] } = useUsers()
  const { data: taskCategories = [] } = useTaskCategories()
  const { data, isLoading } = useReport(type, {
    from: from || undefined,
    to: to || undefined,
    userId: userId || undefined,
    status: status || undefined,
    category: category || undefined,
    priority: priority || undefined,
    taskType: taskType || undefined,
    taskSearch: taskSearch || undefined,
    dateField: type === 'task' ? dateField : undefined,
  })
  const { data: allowedFields = new Map<string, boolean>() } = useAllowedReportFields(type)
  const catalogColumns = useMemo(
    () =>
      (data?.columns ?? [])
        .filter((c) => allowedFields.get(c.key) ?? true)
        .map((c) => ({ id: c.key, label: c.label })),
    [data?.columns, allowedFields],
  )
  const colConfig = useColumnConfig(`reports:${type}`, catalogColumns)
  const visibleColumns = useMemo(
    () =>
      colConfig.visible
        .map((v) => data?.columns.find((c) => c.key === v.id))
        .filter((c): c is NonNullable<typeof c> => !!c),
    [colConfig.visible, data?.columns],
  )
  const hasFilters = !!(from || to || userId || status || category || priority || taskType || taskSearch)

  const sortedRows = useMemo(() => {
    const rows = data?.rows ?? []
    if (!sort) return rows
    const { key, dir } = sort
    const factor = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1 * factor
      if (bv == null) return -1 * factor
      // Try numeric compare; fall back to string.
      const an = Number(av)
      const bn = Number(bv)
      if (!Number.isNaN(an) && !Number.isNaN(bn) && String(av).trim() !== '' && String(bv).trim() !== '') {
        return (an - bn) * factor
      }
      return String(av).localeCompare(String(bv)) * factor
    })
  }, [data?.rows, sort])

  /**
   * What gets exported. Long multi-line cells (planning updates, history) do
   * not survive in a spreadsheet or PDF cell, so for the task report they go
   * out as their own one-row-per-entry tables and the main table keeps a
   * short pointer instead.
   */
  function exportTables(): { rows: Record<string, unknown>[]; extra: ExtraTable[]; subtitle: string } {
    const subtitle = [
      from || to ? `${from ? formatDate(from) : 'start'} to ${to ? formatDate(to) : 'today'}` : '',
      userId ? (users.find((u) => u.id === userId)?.full_name ?? '') : '',
    ]
      .filter(Boolean)
      .join(' · ')
    if (type !== 'task') return { rows: sortedRows, extra: [], subtitle }

    const showPlanning = visibleColumns.some((c) => c.key === 'planningUpdates')
    const showHistory = visibleColumns.some((c) => c.key === 'history')
    const planningRows: Record<string, unknown>[] = []
    const historyRows: Record<string, unknown>[] = []
    const rows = sortedRows.map((row) => {
      const planning = (row._planning as PlanningEntry[] | undefined) ?? []
      const history = (row._history as HistoryEntry[] | undefined) ?? []
      for (const slot of planning)
        planningRows.push({
          task: row.title,
          assignee: row.assignee,
          date: formatDate(slot.date),
          slot: slot.from && slot.to ? `${slot.from}-${slot.to}` : '',
          progress: slot.progress == null ? '' : `${slot.progress}%`,
          planned: slot.planned,
          working: slot.working,
          challenges: slot.challenges,
          entered: formatDateTime(slot.enteredAt),
          timing: slot.lateMinutes > 0 ? `LATE by ${formatLateBy(slot.lateMinutes)}` : 'On time',
          _late: slot.lateMinutes > 0,
        })
      for (const h of history)
        historyRows.push({
          task: row.title,
          assignee: row.assignee,
          when: formatDateTime(h.at),
          status: h.status,
          by: h.by,
          remarks: h.remarks,
        })
      return {
        ...row,
        planningUpdates: planning.length
          ? `${planning.length} slot${planning.length === 1 ? '' : 's'} — see "Planning updates"`
          : '—',
        history: history.length
          ? `${history.length} entr${history.length === 1 ? 'y' : 'ies'} — see "Task history"`
          : '—',
      }
    })
    const extra: ExtraTable[] = []
    if (showPlanning)
      extra.push({
        name: 'Planning updates',
        columns: [
          { key: 'task', label: 'Task' },
          { key: 'assignee', label: 'Assignee' },
          { key: 'date', label: 'Date' },
          { key: 'slot', label: 'Slot' },
          { key: 'progress', label: 'Done %' },
          { key: 'planned', label: 'Planned' },
          { key: 'working', label: 'Work done / update' },
          { key: 'challenges', label: 'Challenges' },
          { key: 'entered', label: 'Entered at' },
          { key: 'timing', label: 'Entry timing' },
        ],
        rows: planningRows,
        fill: planningExtraFill,
      })
    if (showHistory)
      extra.push({
        name: 'Task history',
        columns: [
          { key: 'task', label: 'Task' },
          { key: 'assignee', label: 'Assignee' },
          { key: 'when', label: 'When' },
          { key: 'status', label: 'Status' },
          { key: 'by', label: 'By' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: historyRows,
      })
    return { rows, extra, subtitle }
  }

  return (
    <div data-testid="reports-page">
      <StickyHeader testid="reports-sticky-header">
      <PageHeader
        title="Reports"
        description="Reports across every module — export any of them to Excel or PDF."
        actions={
          data && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                data-testid="export-excel"
                onClick={() => {
                  const out = exportTables()
                  exportExcel(data.filename, visibleColumns, out.rows, out.extra)
                }}
              >
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button
                variant="outline"
                data-testid="export-pdf"
                onClick={() =>
                  {
                    const out = exportTables()
                    exportPdf(
                      data.title,
                      data.filename,
                      visibleColumns,
                      out.rows,
                      type === 'attendance'
                        ? attendanceFill
                        : type === 'planning'
                          ? planningFill
                          : undefined,
                      { subtitle: out.subtitle, extra: out.extra },
                    )
                  }
                }
              >
                <FileText className="size-4" /> PDF
              </Button>
            </div>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Label htmlFor="report-category" className="text-xs text-slate-500">
            Select Report Category
          </Label>
          <Select
            id="report-category"
            data-testid="report-category"
            value={type}
            onChange={(event) => {
              setType(event.target.value as ReportType)
              setStatus('')
              setCategory('')
              setPriority('')
              setTaskType('')
              setTaskSearch('')
              setSort(null)
            }}
            className="mt-1 w-full"
          >
            {TYPES.map((reportType) => (
              <option key={reportType} value={reportType}>
                {REPORT_LABELS[reportType]}
              </option>
            ))}
          </Select>
        </div>
        <ColumnChips
          config={colConfig}
          title="Select Display Headings"
          testid="report-chips"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="report-filters">
        <div>
          <Label htmlFor="report-from" className="text-xs text-slate-500">
            From
          </Label>
          <Input
            id="report-from"
            data-testid="report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="report-to" className="text-xs text-slate-500">
            To
          </Label>
          <Input
            id="report-to"
            data-testid="report-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
        {type === 'attendance' && (
          <div>
            <Label htmlFor="report-attendance-status" className="text-xs text-slate-500">
              Status
            </Label>
            <Select
              id="report-attendance-status"
              data-testid="report-attendance-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-44"
            >
              <option value="">All statuses</option>
              <option value="present">Present (full_day)</option>
              <option value="full_day">Full day</option>
              <option value="half_day">Half day</option>
              <option value="quarter_day">Quarter day</option>
              <option value="absent">Absent</option>
              <option value="late">Late arrivals</option>
              <option value="overtime">With overtime</option>
              <option value="missed_punch_out">Missed punch-out</option>
              <option value="corrected">Manually corrected</option>
            </Select>
          </div>
        )}
        {type === 'planning' && (
          <div>
            <Label htmlFor="report-entry-timing" className="text-xs text-slate-500">
              Entry timing
            </Label>
            <Select
              id="report-entry-timing"
              data-testid="report-entry-timing"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-44"
            >
              <option value="">All entries</option>
              <option value="late">Late entries only</option>
              <option value="on_time">On time only</option>
            </Select>
          </div>
        )}
        {type === 'planning_lock' && (
          <div>
            <Label htmlFor="report-lock-state" className="text-xs text-slate-500">
              State
            </Label>
            <Select
              id="report-lock-state"
              data-testid="report-lock-state"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-44"
            >
              <option value="">Locked + Unlocked</option>
              <option value="locked">Locked now</option>
              <option value="unlocked">Unlocked by admin</option>
            </Select>
          </div>
        )}
        {type === 'task' && (
          <>
            <div>
              <Label htmlFor="report-date-field" className="text-xs text-slate-500">
                From / To apply to
              </Label>
              <Select
                id="report-date-field"
                data-testid="report-date-field"
                value={dateField}
                onChange={(event) => setDateField(event.target.value as 'created' | 'planning')}
                className="w-52"
              >
                <option value="created">Task created date</option>
                <option value="planning">Planning update date</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-task-group" className="text-xs text-slate-500">
                Task group
              </Label>
              <Select
                id="report-task-group"
                data-testid="report-task-group"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-44"
              >
                <option value="">All groups</option>
                {taskCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="report-task-status" className="text-xs text-slate-500">
                Task status
              </Label>
              <Select
                id="report-task-status"
                data-testid="report-task-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-44"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="awaiting_approval">Awaiting Approval</option>
                <option value="rework">Rework</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-task-priority" className="text-xs text-slate-500">
                Priority
              </Label>
              <Select
                id="report-task-priority"
                data-testid="report-task-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="w-36"
              >
                <option value="">All priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-task-type" className="text-xs text-slate-500">
                Task type
              </Label>
              <Select
                id="report-task-type"
                data-testid="report-task-type"
                value={taskType}
                onChange={(event) => setTaskType(event.target.value)}
                className="w-40"
              >
                <option value="">All types</option>
                <option value="self">Self (normal)</option>
                <option value="assigned">Assigned (admin)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-task-search" className="text-xs text-slate-500">
                Task title
              </Label>
              <Input
                id="report-task-search"
                data-testid="report-task-search"
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                placeholder="Search task title"
                className="w-48"
              />
            </div>
          </>
        )}
        {type === 'helpdesk' && (
          <>
            <div>
              <Label className="text-xs text-slate-500">Status</Label>
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-36"
              >
                <option value="">All statuses</option>
                {['open', 'in_progress', 'resolved', 'closed'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Category</Label>
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-36"
              >
                <option value="">All categories</option>
                {['it', 'hr', 'salary', 'leave', 'asset'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Priority</Label>
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="w-36"
              >
                <option value="">All priorities</option>
                {['low', 'medium', 'high'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
        <div>
          <Label htmlFor="report-employee" className="text-xs text-slate-500">
            Employee
          </Label>
          <Select
            id="report-employee"
            data-testid="report-employee"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-56"
          >
            <option value="">All employees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <Button
            variant="outline"
            data-testid="clear-report-filters"
            onClick={() => {
              setFrom('')
              setTo('')
              setUserId('')
              setStatus('')
              setCategory('')
              setPriority('')
              setTaskType('')
              setTaskSearch('')
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      {type === 'attendance' && (
        <div className="mb-0 flex flex-wrap items-center gap-1.5" data-testid="report-legend">
          {LEGEND.map((m) => (
            <span
              key={m.label}
              className={cn('rounded-full px-2 py-0.5 text-xs font-medium', m.className)}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
      </StickyHeader>

      <div className="pt-4">
      {isLoading || !data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : data.rows.length === 0 ? (
        <EmptyState title="No Data Found" testid="report-empty" />
      ) : (
        <>
          <div
            className="mb-2 text-sm font-medium text-slate-600"
            data-testid="report-total-records"
          >
            Total Records: {sortedRows.length}
            {type === 'planning' && (
              <span className="ml-3 inline-flex gap-2" data-testid="planning-late-count">
                <Badge tone="red">
                  Late entries: {sortedRows.filter((r) => r._late).length}
                </Badge>
              </span>
            )}
            {type === 'planning_lock' && (
              <span className="ml-3 inline-flex gap-2" data-testid="lock-report-counts">
                <Badge tone="red">
                  Locked now: {sortedRows.filter((r) => r._state === 'locked').length}
                </Badge>
                <Badge tone="green">
                  Unlocked: {sortedRows.filter((r) => r._state === 'unlocked').length}
                </Badge>
              </span>
            )}
          </div>
          <Table data-testid="report-table">
            <Thead>
              <tr>
                {visibleColumns.map((c) => {
                  const color = colConfig.colorOf(c.key)
                  const active = sort?.key === c.key
                  const dir = active ? sort!.dir : null
                  return (
                    <Th key={c.key} style={color ? { color } : undefined}>
                      <button
                        type="button"
                        data-testid={`report-sort-${c.key}`}
                        onClick={() =>
                          setSort(
                            active && dir === 'asc'
                              ? { key: c.key, dir: 'desc' }
                              : active && dir === 'desc'
                                ? null
                                : { key: c.key, dir: 'asc' },
                          )
                        }
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        {c.label}
                        {dir === 'asc' && <span className="text-[10px]">▲</span>}
                        {dir === 'desc' && <span className="text-[10px]">▼</span>}
                      </button>
                    </Th>
                  )
                })}
              </tr>
            </Thead>
            <Tbody>
              {sortedRows.map((row, i) => (
                <tr
                  key={i}
                  data-testid="report-row"
                  data-late={row._late ? 'true' : undefined}
                  className={cn(
                    type === 'attendance' && !!row._sunday && 'bg-slate-100/70',
                    !!row._late && 'bg-red-50',
                  )}
                >
                  {visibleColumns.map((c) => {
                    const meta =
                      type === 'attendance' && c.key === 'status'
                        ? ATTENDANCE_STATUS[String(row._status ?? '')]
                        : undefined
                    const value = String(row[c.key] ?? '')
                    // History / Description / Remarks / Rework-reason etc can be
                    // multi-line — keep whitespace and cap the visible area so
                    // the row stays scannable. Click to expand (title tooltip).
                    const isLong =
                      c.key === 'history' ||
                      c.key === 'planningUpdates' ||
                      c.key === 'description' ||
                      c.key === 'remarks' ||
                      c.key === 'reworkReason' ||
                      c.key === 'rejectionReason'
                    const planning = c.key === 'planningUpdates' ? (row._planning as PlanningEntry[] | undefined) : undefined
                    const history = c.key === 'history' ? (row._history as HistoryEntry[] | undefined) : undefined
                    if (planning?.length || history?.length) {
                      const count = planning?.length ?? history?.length ?? 0
                      const last = planning?.length
                        ? formatDate(planning[planning.length - 1].date)
                        : formatDate(history![history!.length - 1].at)
                      return (
                        <Td key={c.key} className="align-top whitespace-nowrap">
                          <button
                            type="button"
                            data-testid={planning ? 'report-planning-view' : 'report-history-view'}
                            className="border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
                            onClick={() =>
                              setDetail({
                                title: String(row.title ?? ''),
                                assignee: String(row.assignee ?? ''),
                                planning: planning ?? null,
                                history: history ?? null,
                              })
                            }
                          >
                            {count} {planning ? (count === 1 ? 'slot' : 'slots') : count === 1 ? 'entry' : 'entries'} · View
                          </button>
                          <div className="mt-0.5 text-[11px] text-slate-400">latest {last}</div>
                        </Td>
                      )
                    }
                    if (c.key === 'entry' && type === 'planning') {
                      return (
                        <Td key={c.key} className="whitespace-nowrap" data-testid="report-entry-timing-cell">
                          {row._late ? (
                            <Badge tone="red">{value}</Badge>
                          ) : (
                            <span className="text-xs text-emerald-700">{value}</span>
                          )}
                        </Td>
                      )
                    }
                    if (c.key === 'planningLate' && Number(row.planningLate) > 0) {
                      return (
                        <Td key={c.key}>
                          <Badge tone="red">{value} late</Badge>
                        </Td>
                      )
                    }
                    return (
                      <Td key={c.key} className={isLong ? 'align-top' : undefined}>
                        {meta ? (
                          <Badge className={meta.className}>{value}</Badge>
                        ) : isLong && value && value !== '—' ? (
                          <LongText text={value} testid={`report-long-${c.key}`} />
                        ) : (
                          value
                        )}
                      </Td>
                    )
                  })}
                </tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}
      </div>
      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

interface PlanningEntry {
  date: string
  from: string
  to: string
  progress: number | null
  planned: string
  working: string
  challenges: string
  enteredAt: string
  lateMinutes: number
}
interface HistoryEntry {
  at: string
  status: string
  by: string
  remarks: string
}
interface DetailView {
  title: string
  assignee: string
  planning: PlanningEntry[] | null
  history: HistoryEntry[] | null
}

/**
 * Readable view of a task's planning updates (one row per slot, grouped by
 * date) or its status history — the report cell only shows a count because
 * the full text does not fit in a table cell.
 */
function DetailModal({ detail, onClose }: { detail: DetailView; onClose: () => void }) {
  const planning = detail.planning
  return (
    <Modal
      open
      onClose={onClose}
      size="wide"
      title={`${planning ? 'Planning updates' : 'History'} · ${detail.title}`}
      testid="report-detail-modal"
    >
      <p className="mb-3 text-xs text-slate-500">
        {detail.assignee && detail.assignee !== '—' ? `Assignee: ${detail.assignee} · ` : ''}
        {planning
          ? `${planning.length} planning slot${planning.length === 1 ? '' : 's'} linked to this task, oldest first. ${planning.filter((p) => p.lateMinutes > 0).length} entered late (shaded red).`
          : `${detail.history?.length ?? 0} status change(s), oldest first.`}
      </p>
      {planning ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[52rem] text-left text-sm" data-testid="report-planning-table">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-28 px-3 py-2">Date</th>
                <th className="w-28 px-3 py-2">Slot</th>
                <th className="w-20 px-3 py-2">Done %</th>
                <th className="px-3 py-2">Planned</th>
                <th className="px-3 py-2">Work done / update</th>
                <th className="px-3 py-2">Challenges</th>
                <th className="w-44 px-3 py-2">Entered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {planning.map((slot, i) => {
                const newDate = i === 0 || planning[i - 1].date !== slot.date
                return (
                  <tr
                    key={i}
                    data-late={slot.lateMinutes > 0 ? 'true' : undefined}
                    className={`align-top ${newDate && i > 0 ? 'border-t-2 border-slate-200' : ''} ${slot.lateMinutes > 0 ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap text-slate-900">
                      {newDate ? formatDate(slot.date) : ''}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                      {slot.from && slot.to ? `${slot.from} – ${slot.to}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {slot.progress == null ? (
                        '—'
                      ) : (
                        <Badge tone={slot.progress >= 100 ? 'green' : slot.progress > 0 ? 'blue' : 'slate'}>
                          {slot.progress}%
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-pre-wrap text-slate-700">{slot.planned || '—'}</td>
                    <td className="px-3 py-2 whitespace-pre-wrap text-slate-700">{slot.working || '—'}</td>
                    <td className="px-3 py-2 whitespace-pre-wrap text-amber-700">{slot.challenges || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-600">
                      {formatDateTime(slot.enteredAt)}
                      {slot.lateMinutes > 0 ? (
                        <div className="mt-0.5">
                          <Badge tone="red">Late by {formatLateBy(slot.lateMinutes)}</Badge>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-emerald-700">On time</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[40rem] text-left text-sm" data-testid="report-history-table">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-44 px-3 py-2">When</th>
                <th className="w-40 px-3 py-2">Status</th>
                <th className="w-44 px-3 py-2">By</th>
                <th className="px-3 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(detail.history ?? []).map((h, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDateTime(h.at)}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{h.status}</td>
                  <td className="px-3 py-2 text-slate-700">{h.by}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap text-slate-700">{h.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

/**
 * Multi-line text in a report cell (description, remarks, reasons): keeps the
 * writer's line breaks, shows four lines, and expands in place.
 */
function LongText({ text, testid }: { text: string; testid?: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 180 || text.split('\n').length > 4
  return (
    <div className="max-w-md min-w-56" data-testid={testid}>
      <p
        className={cn(
          'text-[13px] leading-relaxed break-words whitespace-pre-line text-slate-700',
          !open && long && 'line-clamp-4',
        )}
      >
        {text.trim()}
      </p>
      {long && (
        <button
          type="button"
          className="text-brand-600 mt-0.5 text-xs font-medium hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
