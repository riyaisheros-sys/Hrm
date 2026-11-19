import { useMemo } from 'react'
import { FileSpreadsheet, FileText, X } from 'lucide-react'
import { REPORT_LABELS, useAllowedReportFields, useReport, type ReportType } from './hooks'
import { exportExcel, exportPdf, type CellFill } from './export'
import { ATTENDANCE_STATUS, LEGEND, SUNDAY_META } from '@/features/attendance/status'
import { Badge } from '@/components/ui/Badge'
import { useUsers } from '@/features/admin/users/hooks'
import { useTaskCategories } from '@/features/tasks/hooks'
import { ColumnChips } from '@/components/ui/ColumnChips'
import { useColumnConfig } from '@/lib/useColumnConfig'
import { usePersistedState } from '@/lib/usePersistedState'
import { StickyHeader } from '@/components/ui/StickyHeader'
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
  const [sort, setSort] = usePersistedState<{ key: string; dir: 'asc' | 'desc' } | null>(
    'hrms-reports:sort',
    null,
  )
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
                onClick={() => exportExcel(data.filename, visibleColumns, sortedRows)}
              >
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button
                variant="outline"
                data-testid="export-pdf"
                onClick={() =>
                  exportPdf(
                    data.title,
                    data.filename,
                    visibleColumns,
                    sortedRows,
                    type === 'attendance' ? attendanceFill : undefined,
                  )
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
            onChange={(event) => setType(event.target.value as ReportType)}
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
        {type === 'task' && (
          <>
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
                  className={cn(type === 'attendance' && !!row._sunday && 'bg-slate-100/70')}
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
                    const isLong = c.key === 'history' || c.key === 'description' || c.key === 'remarks' || c.key === 'reworkReason' || c.key === 'rejectionReason'
                    return (
                      <Td key={c.key} className={isLong ? 'align-top' : undefined}>
                        {meta ? (
                          <Badge className={meta.className}>{value}</Badge>
                        ) : isLong && value && value !== '—' ? (
                          <div
                            title={value}
                            className="max-h-24 max-w-sm overflow-auto whitespace-pre-wrap text-xs leading-snug text-slate-700"
                          >
                            {value}
                          </div>
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
    </div>
  )
}
