import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, X } from 'lucide-react'
import { REPORT_LABELS, useAllowedReportFields, useReport, type ReportType } from './hooks'
import { exportExcel, exportPdf, type CellFill } from './export'
import { ATTENDANCE_STATUS, LEGEND, SUNDAY_META } from '@/features/attendance/status'
import { Badge } from '@/components/ui/Badge'
import { useUsers } from '@/features/admin/users/hooks'
import { useTaskCategories } from '@/features/tasks/hooks'
import { ColumnChips } from '@/components/ui/ColumnChips'
import { useColumnConfig } from '@/lib/useColumnConfig'
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
  const [type, setType] = useState<ReportType>('attendance')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const { data: users = [] } = useUsers()
  const { data: taskCategories = [] } = useTaskCategories()
  const { data, isLoading } = useReport(type, {
    from: from || undefined,
    to: to || undefined,
    userId: userId || undefined,
    status: status || undefined,
    category: category || undefined,
    priority: priority || undefined,
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
  const hasFilters = !!(from || to || userId || status || category || priority)

  return (
    <div data-testid="reports-page">
      <PageHeader
        title="Reports"
        description="Reports across every module — export any of them to Excel or PDF."
        actions={
          data && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                data-testid="export-excel"
                onClick={() => exportExcel(data.filename, visibleColumns, data.rows)}
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
                    data.rows,
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

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Label htmlFor="report-category">Window 1 · Report category</Label>
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
          title="Window 2 · Display headings"
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
        {type === 'task' && (
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
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      {type === 'attendance' && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="report-legend">
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
            Total Records: {data.rows.length}
          </div>
          <Table data-testid="report-table">
            <Thead>
              <tr>
                {visibleColumns.map((c) => {
                  const color = colConfig.colorOf(c.key)
                  return (
                    <Th key={c.key} style={color ? { color } : undefined}>
                      {c.label}
                    </Th>
                  )
                })}
              </tr>
            </Thead>
            <Tbody>
              {data.rows.map((row, i) => (
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
                    return (
                      <Td key={c.key}>
                        {meta ? (
                          <Badge className={meta.className}>{String(row[c.key] ?? '')}</Badge>
                        ) : (
                          String(row[c.key] ?? '')
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
  )
}
