import { useState } from 'react'
import { Check, MessageSquarePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  DURATION_LABEL,
  type LeaveDuration,
  useAllLeaveRequests,
  useCreateHoliday,
  useDeleteLeaveRequest,
  useDeleteHoliday,
  useHolidays,
  useLeaveRealtime,
  usePendingApprovals,
  useSetLeaveRemark,
  useUpdateHoliday,
  type Holiday,
  type LeaveRequestRow,
} from './hooks'
import { todayInTz } from '@/features/attendance/geo'
import { useProfile } from '@/features/rbac/profile-context'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { SortFilterTh } from '@/components/ui/SortFilterTh'
import { useTableControls } from '@/lib/useTableControls'
import { LeaveDecisionModal } from './LeaveDecisionModal'

const STATUS_TONE = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  cancelled: 'slate',
} as const

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      </CardBody>
    </Card>
  )
}

export function LeaveApprovalsPage() {
  useLeaveRealtime()
  const { hasPermission } = useProfile()
  const canManageHolidays = hasPermission('holidays.manage')
  const { data: pending = [], isLoading } = usePendingApprovals()
  const { data: all = [] } = useAllLeaveRequests()
  const remove = useDeleteLeaveRequest()
  const toast = useToast()
  const [remarkReq, setRemarkReq] = useState<LeaveRequestRow | null>(null)
  const [deleteReq, setDeleteReq] = useState<LeaveRequestRow | null>(null)
  const [decisionReq, setDecisionReq] = useState<{
    request: LeaveRequestRow
    decision: 'approved' | 'rejected'
  } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all')

  const today = todayInTz('Asia/Kolkata')
  const approved = all.filter((r) => r.status === 'approved')
  const rejected = all.filter((r) => r.status === 'rejected')
  const onLeaveToday = approved.filter((r) => r.start_date <= today && r.end_date >= today).length
  const approvedDays = approved.reduce((s, r) => s + Number(r.days), 0)
  const filteredAll = statusFilter === 'all' ? all : all.filter((r) => r.status === statusFilter)
  const leaveAccessors = {
    employee: (r: LeaveRequestRow) => r.requester?.full_name || r.requester?.email,
    type: (r: LeaveRequestRow) => r.leave_type?.name,
    from: (r: LeaveRequestRow) => r.start_date,
    to: (r: LeaveRequestRow) => r.end_date,
    duration: (r: LeaveRequestRow) =>
      DURATION_LABEL[(r.duration as LeaveDuration) ?? 'full_day'] ?? 'Full day',
    days: (r: LeaveRequestRow) => Number(r.days),
    status: (r: LeaveRequestRow) => r.status,
  }
  const pendingControls = useTableControls(pending, leaveAccessors)
  const allControls = useTableControls(filteredAll, leaveAccessors)
  const pendingPage = usePagination(pendingControls.rows, 25, pendingControls.stateKey)
  const allPage = usePagination(allControls.rows, 25, `${statusFilter}|${allControls.stateKey}`)

  return (
    <div data-testid="leave-approvals-page">
      <PageHeader title="Leave Approvals" description="Review and decide pending leave requests." />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="leave-admin-insights">
        <Stat label="Pending" value={pending.length} tone="text-amber-600" />
        <Stat label="Approved" value={approved.length} tone="text-emerald-600" />
        <Stat label="Rejected" value={rejected.length} tone="text-red-600" />
        <Stat label="On leave today" value={onLeaveToday} tone="text-blue-600" />
        <Stat label="Approved days (total)" value={approvedDays} />
      </div>

      {!isLoading && pending.length === 0 ? (
        <EmptyState title="No pending requests" testid="approvals-empty" />
      ) : (
        <Table data-testid="approvals-table">
          <Thead>
            <tr>
              <SortFilterTh controls={pendingControls} k="employee">Employee</SortFilterTh>
              <SortFilterTh controls={pendingControls} k="type">Type</SortFilterTh>
              <SortFilterTh controls={pendingControls} k="from">From</SortFilterTh>
              <SortFilterTh controls={pendingControls} k="to">To</SortFilterTh>
              <SortFilterTh controls={pendingControls} k="duration">Duration</SortFilterTh>
              <SortFilterTh controls={pendingControls} k="days" filterable={false}>Days</SortFilterTh>
              <Th className="text-right">Decision</Th>
            </tr>
          </Thead>
          <Tbody>
            {pendingPage.pagedItems.map((r) => (
              <tr key={r.id} data-testid={`approval-row-${r.requester?.email}`}>
                <Td className="font-medium text-slate-900">{r.requester?.full_name || r.requester?.email}</Td>
                <Td>{r.leave_type?.name}</Td>
                <Td>{r.start_date}</Td>
                <Td>{r.end_date}</Td>
                <Td data-testid="approval-duration">
                  {DURATION_LABEL[(r.duration as LeaveDuration) ?? 'full_day'] ?? 'Full day'}
                </Td>
                <Td>{r.days}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      data-testid="approve-leave"
                      onClick={() => setDecisionReq({ request: r, decision: 'approved' })}
                    >
                      <Check className="size-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      data-testid="reject-leave"
                      onClick={() => setDecisionReq({ request: r, decision: 'rejected' })}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
      <Pagination {...pendingPage} testid="leave-pending-pagination" />

      <section className="mt-10" data-testid="all-leave-section">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">All leave requests</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="leave-status-filter" className="mb-0 text-xs text-slate-500">
              Status
            </Label>
            <Select
              id="leave-status-filter"
              data-testid="leave-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-9 w-40"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        </div>
        {filteredAll.length === 0 ? (
          <EmptyState title="No leave requests" testid="all-leave-empty" />
        ) : (
          <Table data-testid="all-leave-table">
            <Thead>
              <tr>
                <SortFilterTh controls={allControls} k="employee">Employee</SortFilterTh>
                <SortFilterTh controls={allControls} k="type">Type</SortFilterTh>
                <SortFilterTh controls={allControls} k="from">From</SortFilterTh>
                <SortFilterTh controls={allControls} k="to">To</SortFilterTh>
                <SortFilterTh controls={allControls} k="duration">Duration</SortFilterTh>
                <SortFilterTh controls={allControls} k="days" filterable={false}>Days</SortFilterTh>
                <SortFilterTh controls={allControls} k="status">Status</SortFilterTh>
                <Th>Admin remark</Th>
                <Th className="w-px" />
              </tr>
            </Thead>
            <Tbody>
              {allPage.pagedItems.map((r) => (
                <tr key={r.id} data-testid={`all-leave-row-${r.requester?.email}`}>
                  <Td className="font-medium text-slate-900">{r.requester?.full_name || r.requester?.email}</Td>
                  <Td>{r.leave_type?.name}</Td>
                  <Td>{r.start_date}</Td>
                  <Td>{r.end_date}</Td>
                  <Td>{DURATION_LABEL[(r.duration as LeaveDuration) ?? 'full_day'] ?? 'Full day'}</Td>
                  <Td>{r.days}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>{r.status}</Badge>
                  </Td>
                  <Td className="max-w-xs text-xs text-slate-500" data-testid="all-leave-remark">
                    {r.admin_remarks || <span className="text-slate-300">—</span>}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button
                        data-testid={`remark-leave-${r.requester?.email}`}
                        aria-label={`Add remark for ${r.requester?.full_name}`}
                        className="rounded-md p-1 text-slate-400 hover:text-brand-600"
                        onClick={() => setRemarkReq(r)}
                      >
                        <MessageSquarePlus className="size-4" />
                      </button>
                      <button
                        data-testid={`delete-leave-${r.id}`}
                        aria-label={`Delete leave request for ${r.requester?.full_name}`}
                        className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setDeleteReq(r)}
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
        <Pagination {...allPage} testid="leave-all-pagination" />
      </section>

      {remarkReq && <RemarkModal request={remarkReq} onClose={() => setRemarkReq(null)} />}
      {deleteReq && (
        <ConfirmDialog
          title="Delete leave request"
          message={`Delete the ${deleteReq.leave_type?.name ?? 'leave'} request for ${deleteReq.requester?.full_name ?? deleteReq.requester?.email ?? 'this employee'}? Approved leave will be removed from the used balance.`}
          confirmLabel="Delete request"
          loading={remove.isPending}
          onClose={() => setDeleteReq(null)}
          onConfirm={() =>
            remove.mutate(
              { id: deleteReq.id },
              {
                onSuccess: () => {
                  toast.success('Leave request deleted')
                  setDeleteReq(null)
                },
                onError: (error) => toast.error('Delete failed', (error as Error).message),
              },
            )
          }
        />
      )}
      {decisionReq && (
        <LeaveDecisionModal
          request={decisionReq.request}
          decision={decisionReq.decision}
          onClose={() => setDecisionReq(null)}
        />
      )}
      {canManageHolidays && <HolidaySection />}
    </div>
  )
}

function RemarkModal({ request, onClose }: { request: LeaveRequestRow; onClose: () => void }) {
  const setRemark = useSetLeaveRemark()
  const toast = useToast()
  const [remark, setRemark_] = useState(request.admin_remarks ?? '')

  return (
    <Modal
      open
      onClose={onClose}
      title={`Remark · ${request.requester?.full_name || request.requester?.email}`}
      testid="leave-remark-modal"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setRemark.mutate(
            { id: request.id, remark },
            {
              onSuccess: () => {
                toast.success('Remark saved')
                onClose()
              },
              onError: (err) => toast.error('Save failed', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="leave-remark-text">Admin remark</Label>
          <Textarea
            id="leave-remark-text"
            data-testid="leave-remark-textarea"
            rows={4}
            placeholder="Note visible to the employee (e.g. reason, conditions, follow-up)"
            value={remark}
            onChange={(e) => setRemark_(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="save-leave-remark" loading={setRemark.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function HolidaySection() {
  const { data: holidays = [] } = useHolidays()
  const create = useCreateHoliday()
  const del = useDeleteHoliday()
  const toast = useToast()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [deleting, setDeleting] = useState<Holiday | null>(null)

  return (
    <section className="mt-10" data-testid="holidays-section">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Holiday calendar</h2>
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            { name: name.trim(), date },
            {
              onSuccess: () => {
                toast.success('Holiday added')
                setName('')
                setDate('')
              },
              onError: (err) => toast.error('Could not add', (err as Error).message),
            },
          )
        }}
      >
        <Input data-testid="holiday-name" placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)} required className="w-48" />
        <Input data-testid="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-44" />
        <Button type="submit" data-testid="add-holiday" loading={create.isPending}>
          <Plus className="size-4" /> Add
        </Button>
      </form>
      <Table data-testid="holidays-table">
        <Thead>
          <tr>
            <Th>Date</Th>
            <Th>Name</Th>
            <Th className="w-px" />
          </tr>
        </Thead>
        <Tbody>
          {holidays.map((h) => (
            <tr key={h.id} data-testid="holiday-row">
              <Td>{h.holiday_date}</Td>
              <Td className="font-medium text-slate-900">{h.name}</Td>
              <Td>
                <div className="flex gap-1">
                  <button
                    type="button"
                    data-testid="edit-holiday"
                    aria-label={`Edit ${h.name}`}
                    className="hover:text-brand-600 rounded-md p-1 text-slate-400"
                    onClick={() => setEditing(h)}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    data-testid="delete-holiday"
                    aria-label={`Delete ${h.name}`}
                    className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setDeleting(h)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </Tbody>
      </Table>

      {editing && <HolidayEditModal holiday={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete holiday"
          testid="delete-holiday-dialog"
          confirmLabel="Delete"
          loading={del.isPending}
          onClose={() => setDeleting(null)}
          message={
            <p>
              Delete <span className="font-semibold text-slate-900">{deleting.name}</span> (
              {deleting.holiday_date}) from the holiday calendar? This cannot be undone.
            </p>
          }
          onConfirm={() =>
            del.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('Holiday deleted')
                setDeleting(null)
              },
              onError: (e) => toast.error('Delete failed', (e as Error).message),
            })
          }
        />
      )}
    </section>
  )
}

function HolidayEditModal({ holiday, onClose }: { holiday: Holiday; onClose: () => void }) {
  const update = useUpdateHoliday()
  const toast = useToast()
  const [name, setName] = useState(holiday.name)
  const [date, setDate] = useState(holiday.holiday_date)

  return (
    <Modal open onClose={onClose} title="Edit holiday" testid="holiday-edit-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate(
            { id: holiday.id, name: name.trim(), date },
            {
              onSuccess: () => {
                toast.success('Holiday updated')
                onClose()
              },
              onError: (err) => toast.error('Save failed', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="holiday-edit-name">Name</Label>
          <Input
            id="holiday-edit-name"
            data-testid="holiday-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="holiday-edit-date">Date</Label>
          <Input
            id="holiday-edit-date"
            data-testid="holiday-edit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="save-holiday" loading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
