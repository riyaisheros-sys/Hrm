import { useState } from 'react'
import { IdCard, Pencil, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useDeleteVisitor, useSetVisitorPass, useUpdateVisitor, type Visitor } from './hooks'
import { generateLetterPdf } from '@/lib/pdfLetter'
import { usePeople } from '@/lib/people'
import { FALLBACK_VISIT_PURPOSES, useMasterOptions } from '@/lib/masterOptions'
import { useToast } from '@/components/ui/toast-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'

/** Pass code badge — "Removed" once the pass has been revoked. */
export function PassCode({ code, testid }: { code: string | null; testid: string }) {
  return code ? (
    <Badge tone="slate" data-testid={testid}>
      {code}
    </Badge>
  ) : (
    <Badge tone="red" data-testid={testid}>
      Pass removed
    </Badge>
  )
}

/**
 * Row actions for a visitor: print the pass, remove / re-issue the pass code,
 * edit the visitor, and delete the visitor (with a confirmation).
 */
export function VisitorActions({
  visitor,
  hostName,
  purposeLabel,
  testPrefix = '',
  allowHostChange = false,
}: {
  visitor: Visitor
  hostName?: string
  purposeLabel?: string
  testPrefix?: string
  /** Admins (visitors.manage) may move the visitor to another host. */
  allowHostChange?: boolean
}) {
  const setPass = useSetVisitorPass()
  const remove = useDeleteVisitor()
  const toast = useToast()
  const [confirm, setConfirm] = useState<'delete' | 'remove-pass' | null>(null)
  const [editing, setEditing] = useState(false)
  const code = visitor.pass_code

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {code ? (
        <>
          <Button
            size="sm"
            variant="outline"
            data-testid={`${testPrefix}generate-pass`}
            onClick={() =>
              generateLetterPdf(`visitor-pass-${code}`, 'Visitor Pass', [
                `Visitor: ${visitor.name}${visitor.company ? ` (${visitor.company})` : ''}`,
                ...(hostName ? [`Host: ${hostName}`] : []),
                ...(purposeLabel ? [`Purpose: ${purposeLabel}`] : []),
                `Date: ${visitor.visit_date}`,
                `Pass code: ${code}`,
              ])
            }
          >
            <IdCard className="size-4" /> Pass
          </Button>
          <button
            type="button"
            data-testid={`${testPrefix}remove-pass`}
            title="Remove pass code"
            aria-label={`Remove pass code of ${visitor.name}`}
            className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700"
            onClick={() => setConfirm('remove-pass')}
          >
            <XCircle className="size-4" />
          </button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          data-testid={`${testPrefix}issue-pass`}
          loading={setPass.isPending}
          onClick={() =>
            setPass.mutate(
              { id: visitor.id, issue: true },
              {
                onSuccess: (newCode) => toast.success('New pass issued', `Pass code ${newCode}`),
                onError: (err) => toast.error('Could not issue a pass', (err as Error).message),
              },
            )
          }
        >
          <RotateCcw className="size-4" /> Issue pass
        </Button>
      )}
      <button
        type="button"
        data-testid={`${testPrefix}edit-visitor`}
        aria-label={`Edit visitor ${visitor.name}`}
        className="hover:text-brand-600 rounded-md p-1.5 text-slate-400 hover:bg-slate-50"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        data-testid={`${testPrefix}delete-visitor`}
        aria-label={`Delete visitor ${visitor.name}`}
        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        onClick={() => setConfirm('delete')}
      >
        <Trash2 className="size-4" />
      </button>

      {editing && (
        <VisitorEditModal
          visitor={visitor}
          allowHostChange={allowHostChange}
          testPrefix={testPrefix}
          onClose={() => setEditing(false)}
        />
      )}
      {confirm === 'remove-pass' && (
        <ConfirmDialog
          title="Remove pass code"
          testid="remove-pass-dialog"
          confirmLabel="Remove pass"
          loading={setPass.isPending}
          onClose={() => setConfirm(null)}
          message={
            <p>
              Remove pass code <span className="font-mono font-semibold">{code}</span> of{' '}
              <span className="font-semibold text-slate-900">{visitor.name}</span>? The pass will
              no longer be valid. You can issue a new one later.
            </p>
          }
          onConfirm={() =>
            setPass.mutate(
              { id: visitor.id, issue: false },
              {
                onSuccess: () => {
                  toast.success('Pass code removed')
                  setConfirm(null)
                },
                onError: (err) => toast.error('Could not remove the pass', (err as Error).message),
              },
            )
          }
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title="Delete visitor"
          testid="delete-visitor-dialog"
          confirmLabel="Delete"
          loading={remove.isPending}
          onClose={() => setConfirm(null)}
          message={
            <p>
              Delete visitor <span className="font-semibold text-slate-900">{visitor.name}</span>{' '}
              ({visitor.visit_date})? This cannot be undone.
            </p>
          }
          onConfirm={() =>
            remove.mutate(visitor.id, {
              onSuccess: () => {
                toast.success('Visitor deleted')
                setConfirm(null)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
    </div>
  )
}

function VisitorEditModal({
  visitor,
  allowHostChange,
  testPrefix,
  onClose,
}: {
  visitor: Visitor
  allowHostChange: boolean
  testPrefix: string
  onClose: () => void
}) {
  const update = useUpdateVisitor()
  const toast = useToast()
  const purposes = useMasterOptions('visit_purposes', FALLBACK_VISIT_PURPOSES)
  const { data: users = [] } = usePeople()
  const [name, setName] = useState(visitor.name)
  const [company, setCompany] = useState(visitor.company ?? '')
  const [purpose, setPurpose] = useState(visitor.purpose ?? '')
  const [hostId, setHostId] = useState(visitor.host_id ?? '')
  const [visitDate, setVisitDate] = useState(visitor.visit_date)
  const hosts = users.filter((u) => u.status === 'active' || u.id === visitor.host_id)
  const purposeValue = purpose || purposes.options[0]?.code || ''

  return (
    <Modal open onClose={onClose} title="Edit visitor" testid={`${testPrefix}visitor-edit-modal`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate(
            {
              id: visitor.id,
              name: name.trim(),
              company: company.trim(),
              purpose: purposeValue,
              ...(allowHostChange ? { hostId: hostId || null } : {}),
              visitDate,
            },
            {
              onSuccess: () => {
                toast.success('Visitor updated')
                onClose()
              },
              onError: (err) => toast.error('Save failed', (err as Error).message),
            },
          )
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="visitor-edit-name">Visitor name</Label>
            <Input
              id="visitor-edit-name"
              data-testid="visitor-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="visitor-edit-company">Company</Label>
            <Input
              id="visitor-edit-company"
              data-testid="visitor-edit-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="visitor-edit-purpose">Purpose</Label>
            <Select
              id="visitor-edit-purpose"
              data-testid="visitor-edit-purpose"
              value={purposeValue}
              onChange={(e) => setPurpose(e.target.value)}
            >
              {purposes.options.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
              {visitor.purpose && !purposes.options.some((p) => p.code === visitor.purpose) && (
                <option value={visitor.purpose}>{purposes.labelOf(visitor.purpose)}</option>
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="visitor-edit-date">Visit date</Label>
            <Input
              id="visitor-edit-date"
              data-testid="visitor-edit-date"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              required
            />
          </div>
        </div>
        {allowHostChange && (
          <div>
            <Label htmlFor="visitor-edit-host">Host</Label>
            <Select
              id="visitor-edit-host"
              data-testid="visitor-edit-host"
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
            >
              {!visitor.host_id && <option value="">— No host —</option>}
              {hosts.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="save-visitor" loading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
