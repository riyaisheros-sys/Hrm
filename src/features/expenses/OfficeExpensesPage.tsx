import { useMemo, useState } from 'react'
import { Check, Download, Eye, Pencil, Plus, Receipt, Trash2, X } from 'lucide-react'
import {
  billUrl,
  PAYMENT_MODES,
  useDeleteExpense,
  useOfficeExpenses,
  useSaveExpense,
  useSetExpenseStatus,
  type ExpenseStatus,
  type OfficeExpense,
} from './hooks'
import { useMasterOptions, type MasterOption } from '@/lib/masterOptions'
import { usePeople } from '@/lib/people'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/rbac/profile-context'
import { exportExcel } from '@/features/reports/export'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FileInput } from '@/components/ui/FileInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'

// Used only until the Expense Categories master exists on the database.
const FALLBACK_CATEGORIES: MasterOption[] = [
  { code: 'office_supplies', name: 'Office supplies' },
  { code: 'food_refreshments', name: 'Food & refreshments' },
  { code: 'travel_conveyance', name: 'Travel & conveyance' },
  { code: 'utilities', name: 'Electricity / internet / phone' },
  { code: 'other', name: 'Other' },
]

const STATUS: Record<ExpenseStatus, { label: string; tone: 'amber' | 'green' | 'red' | 'blue' }> = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  paid: { label: 'Paid', tone: 'green' },
}

// Bills often have paise; show them only when there are some.
const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const monthStart = () => `${today().slice(0, 7)}-01`

/** Office expenses with bills (client, 26 Nov). */
export function OfficeExpensesPage() {
  const { user } = useAuth()
  const { hasPermission } = useProfile()
  const canSeeAll = hasPermission('expenses.view') || hasPermission('expenses.manage')
  const canAdd = hasPermission('expenses.add') || hasPermission('expenses.manage')
  const canManage = hasPermission('expenses.manage')
  const canEditAny = hasPermission('expenses.edit') || canManage
  const canDeleteAny = hasPermission('expenses.delete') || canManage

  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const { data: expenses = [], isLoading } = useOfficeExpenses({ from, to })
  const categories = useMasterOptions('expense_categories', FALLBACK_CATEGORIES)
  const { data: people = [] } = usePeople()
  const nameOf = (id: string | null) => {
    const p = people.find((x) => x.id === id)
    return p ? p.full_name || p.email : '—'
  }
  const [editing, setEditing] = useState<OfficeExpense | 'new' | null>(null)
  const [deleting, setDeleting] = useState<OfficeExpense | null>(null)
  const [rejecting, setRejecting] = useState<OfficeExpense | null>(null)
  const remove = useDeleteExpense()
  const setExpenseStatus = useSetExpenseStatus()
  const toast = useToast()

  const needle = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      expenses.filter(
        (e) =>
          (!category || e.category === category) &&
          (!status || e.status === status) &&
          (!needle ||
            [e.description, e.vendor, e.reference_no, e.remarks]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(needle))),
      ),
    [expenses, category, status, needle],
  )
  const page = usePagination(rows, 25, `${from}|${to}|${category}|${status}|${needle}`)
  const total = (list: OfficeExpense[]) => list.reduce((s, e) => s + Number(e.amount || 0), 0)
  const counted = rows.filter((e) => e.status !== 'rejected')
  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of counted) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount))
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [counted])

  const decide = (e: OfficeExpense, next: ExpenseStatus, remarks?: string) =>
    setExpenseStatus.mutate(
      { id: e.id, status: next, remarks },
      {
        onSuccess: () => {
          toast.success(`Marked ${STATUS[next].label.toLowerCase()}`)
          setRejecting(null)
        },
        onError: (err) => toast.error('Could not update', (err as Error).message),
      },
    )

  return (
    <div data-testid="expenses-page">
      <PageHeader
        title="Office Expenses"
        description={
          canSeeAll
            ? 'Every office expense with its bill. Categories are managed in Centralized Masters → Expense Categories.'
            : 'The office expenses you have entered.'
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              data-testid="expenses-export"
              disabled={rows.length === 0}
              onClick={() =>
                exportExcel(
                  `office-expenses-${from}-to-${to}`,
                  [
                    { key: 'date', label: 'Date' },
                    { key: 'category', label: 'Category' },
                    { key: 'description', label: 'Description' },
                    { key: 'vendor', label: 'Paid to' },
                    { key: 'mode', label: 'Payment mode' },
                    { key: 'reference', label: 'Reference' },
                    { key: 'amount', label: 'Amount' },
                    { key: 'status', label: 'Status' },
                    { key: 'bill', label: 'Bill' },
                    { key: 'by', label: 'Entered by' },
                    { key: 'remarks', label: 'Remarks' },
                  ],
                  rows.map((e) => ({
                    date: formatDate(e.expense_date),
                    category: categories.labelOf(e.category),
                    description: e.description,
                    vendor: e.vendor ?? '',
                    mode: PAYMENT_MODES.find((m) => m.value === e.payment_mode)?.label ?? '',
                    reference: e.reference_no ?? '',
                    amount: Number(e.amount),
                    status: STATUS[e.status].label,
                    bill: e.bill_name ? 'Attached' : 'No bill',
                    by: nameOf(e.submitted_by),
                    remarks: e.remarks ?? '',
                  })),
                )
              }
            >
              <Download className="size-4" /> Excel
            </Button>
            {canAdd && (
              <Button data-testid="add-expense" onClick={() => setEditing('new')}>
                <Plus className="size-4" /> Add expense
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="expense-summary">
        <SummaryCard label="Total (excl. rejected)" value={inr(total(counted))} tone="brand" />
        <SummaryCard
          label="Pending approval"
          value={`${rows.filter((e) => e.status === 'pending').length} · ${inr(total(rows.filter((e) => e.status === 'pending')))}`}
          tone="amber"
        />
        <SummaryCard
          label="Paid"
          value={inr(total(rows.filter((e) => e.status === 'paid')))}
          tone="green"
        />
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
          <p className="mb-1 font-medium text-slate-500">Top categories</p>
          {byCategory.length === 0 ? (
            <p className="text-slate-400">—</p>
          ) : (
            byCategory.map(([code, amount]) => (
              <p key={code} className="flex justify-between text-slate-700">
                <span className="truncate">{categories.labelOf(code)}</span>
                <span className="font-medium tabular-nums">{inr(amount)}</span>
              </p>
            ))
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label htmlFor="exp-from" className="text-xs text-slate-500">
            From
          </Label>
          <Input id="exp-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label htmlFor="exp-to" className="text-xs text-slate-500">
            To
          </Label>
          <Input id="exp-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label htmlFor="exp-cat" className="text-xs text-slate-500">
            Category
          </Label>
          <Select id="exp-cat" data-testid="expense-category-filter" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9">
            <option value="">All categories</option>
            {categories.options.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="exp-status" className="text-xs text-slate-500">
            Status
          </Label>
          <Select id="exp-status" data-testid="expense-status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9">
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="exp-search" className="text-xs text-slate-500">
            Search
          </Label>
          <Input id="exp-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description, vendor, reference" className="h-9" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No expenses in this period"
          description={canAdd ? 'Use "Add expense" to enter one with its bill.' : undefined}
          testid="expenses-empty"
        />
      ) : (
        <Table data-testid="expenses-table">
          <Thead>
            <tr>
              <Th>Date</Th>
              <Th>Category</Th>
              <Th>Description</Th>
              <Th>Paid to / mode</Th>
              <Th className="text-right">Amount</Th>
              <Th>Bill</Th>
              <Th>Status</Th>
              <Th>Entered by</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {page.pagedItems.map((e) => {
              const mine = e.submitted_by === user?.id
              const canEdit = canEditAny || (mine && e.status === 'pending')
              const canDelete = canDeleteAny || (mine && e.status === 'pending')
              return (
                <tr key={e.id} data-testid="expense-row">
                  <Td className="whitespace-nowrap">{formatDate(e.expense_date)}</Td>
                  <Td>
                    <Badge tone="slate">{categories.labelOf(e.category)}</Badge>
                  </Td>
                  <Td className="max-w-72">
                    <p className="text-sm whitespace-pre-line text-slate-800">{e.description}</p>
                    {e.remarks && <p className="mt-0.5 text-xs text-slate-500 italic">{e.remarks}</p>}
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {e.vendor || '—'}
                    <div className="text-slate-400">
                      {PAYMENT_MODES.find((m) => m.value === e.payment_mode)?.label ?? ''}
                      {e.reference_no ? ` · ${e.reference_no}` : ''}
                    </div>
                  </Td>
                  <Td className="text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                    {inr(Number(e.amount))}
                  </Td>
                  <Td>
                    {e.bill_path ? (
                      <button
                        type="button"
                        data-testid="view-bill"
                        title={e.bill_name ?? 'Bill'}
                        className="text-brand-600 hover:bg-brand-50 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                        onClick={async () => {
                          const url = await billUrl(e.bill_path!)
                          if (url) window.open(url, '_blank')
                          else toast.error('Could not open the bill')
                        }}
                      >
                        <Eye className="size-3.5" /> View
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">No bill</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={STATUS[e.status].tone} data-testid="expense-status">
                      {STATUS[e.status].label}
                    </Badge>
                    {e.decided_by && (
                      <div className="mt-0.5 text-[11px] text-slate-400">by {nameOf(e.decided_by)}</div>
                    )}
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-slate-500">{nameOf(e.submitted_by)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {canManage && e.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            data-testid="approve-expense"
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                            onClick={() => decide(e, 'approved')}
                          >
                            <Check className="size-3.5" /> Approve
                          </button>
                          <button
                            type="button"
                            data-testid="reject-expense"
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                            onClick={() => setRejecting(e)}
                          >
                            <X className="size-3.5" /> Reject
                          </button>
                        </>
                      )}
                      {canManage && e.status === 'approved' && (
                        <button
                          type="button"
                          data-testid="pay-expense"
                          className="rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          onClick={() => decide(e, 'paid')}
                        >
                          Mark paid
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          data-testid="edit-expense"
                          aria-label="Edit expense"
                          className="hover:text-brand-600 rounded p-1 text-slate-400"
                          onClick={() => setEditing(e)}
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          data-testid="delete-expense"
                          aria-label="Delete expense"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setDeleting(e)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              )
            })}
          </Tbody>
        </Table>
      )}
      <Pagination {...page} testid="expenses-pagination" />

      {editing && (
        <ExpenseModal
          expense={editing === 'new' ? null : editing}
          categories={categories.options}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete expense"
          testid="delete-expense-dialog"
          confirmLabel="Delete"
          loading={remove.isPending}
          onClose={() => setDeleting(null)}
          message={
            <p>
              Delete the expense of <span className="font-semibold">{inr(Number(deleting.amount))}</span>{' '}
              on {formatDate(deleting.expense_date)} ({deleting.description})? Its bill is deleted too.
              This cannot be undone.
            </p>
          }
          onConfirm={() =>
            remove.mutate(deleting, {
              onSuccess: () => {
                toast.success('Expense deleted')
                setDeleting(null)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
      {rejecting && (
        <RejectModal
          expense={rejecting}
          saving={setExpenseStatus.isPending}
          onClose={() => setRejecting(null)}
          onReject={(reason) => decide(rejecting, 'rejected', reason)}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'brand' | 'amber' | 'green' }) {
  const cls = {
    brand: 'border-brand-200 bg-brand-50 text-brand-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[tone]
  return (
    <div className={cn('rounded-xl border px-4 py-3', cls)}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  )
}

function RejectModal({
  expense,
  saving,
  onClose,
  onReject,
}: {
  expense: OfficeExpense
  saving: boolean
  onClose: () => void
  onReject: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal open onClose={onClose} title="Reject expense" testid="reject-expense-modal">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onReject(reason)
        }}
      >
        <p className="text-sm text-slate-600">
          {expense.description} · {inr(Number(expense.amount))}
        </p>
        <div>
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea id="reject-reason" data-testid="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" data-testid="confirm-reject-expense" loading={saving}>
            Reject
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ExpenseModal({
  expense,
  categories,
  onClose,
}: {
  expense: OfficeExpense | null
  categories: MasterOption[]
  onClose: () => void
}) {
  const save = useSaveExpense()
  const toast = useToast()
  const [date, setDate] = useState(expense?.expense_date ?? today())
  const [category, setCategory] = useState(expense?.category ?? categories[0]?.code ?? 'other')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [vendor, setVendor] = useState(expense?.vendor ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [mode, setMode] = useState(expense?.payment_mode ?? 'cash')
  const [reference, setReference] = useState(expense?.reference_no ?? '')
  const [remarks, setRemarks] = useState(expense?.remarks ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [removeBill, setRemoveBill] = useState(false)

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add expense'}
      testid="expense-modal"
      size="wide"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(
            {
              id: expense?.id,
              current: expense,
              expense_date: date,
              category,
              description,
              vendor,
              amount: Number(amount),
              payment_mode: mode,
              reference_no: reference,
              remarks,
              bill: files[0] ?? null,
              removeBill,
            },
            {
              onSuccess: () => {
                toast.success(expense ? 'Expense updated' : 'Expense added')
                onClose()
              },
              onError: (err) => toast.error('Could not save', (err as Error).message),
            },
          )
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="exp-date">Date</Label>
            <Input id="exp-date" data-testid="expense-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="exp-category">Category</Label>
            <Select id="exp-category" data-testid="expense-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
              {expense && !categories.some((c) => c.code === expense.category) && (
                <option value={expense.category}>{expense.category}</option>
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="exp-amount">Amount (₹)</Label>
            <Input id="exp-amount" data-testid="expense-amount" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label htmlFor="exp-description">Description</Label>
          <Textarea id="exp-description" data-testid="expense-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was bought or paid for" required />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="exp-vendor">Paid to (vendor)</Label>
            <Input id="exp-vendor" data-testid="expense-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="exp-mode">Payment mode</Label>
            <Select id="exp-mode" data-testid="expense-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="exp-ref">Bill / reference no.</Label>
            <Input id="exp-ref" data-testid="expense-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="exp-bill">Bill / document</Label>
          <FileInput
            id="exp-bill"
            testid="expense-bill"
            accept="image/*,application/pdf"
            files={files}
            onChange={(f) => {
              setFiles(f)
              if (f.length) setRemoveBill(false)
            }}
            hint={
              expense?.bill_name && !removeBill && files.length === 0
                ? `Current bill: ${expense.bill_name} — choose a file to replace it.`
                : 'Photo or PDF of the bill'
            }
          />
          {expense?.bill_path && files.length === 0 && (
            <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={removeBill} onChange={(e) => setRemoveBill(e.target.checked)} />
              Remove the current bill
            </label>
          )}
        </div>
        <div>
          <Label htmlFor="exp-remarks">Remarks</Label>
          <Input id="exp-remarks" data-testid="expense-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs text-slate-400">
            <Receipt className="size-3.5" /> New expenses start as Pending until an expense manager approves them.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="save-expense" loading={save.isPending}>
              {expense ? 'Save' : 'Add expense'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
