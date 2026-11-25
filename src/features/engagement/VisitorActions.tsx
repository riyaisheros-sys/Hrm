import { useState } from 'react'
import { IdCard, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useDeleteVisitor, useSetVisitorPass, type Visitor } from './hooks'
import { generateLetterPdf } from '@/lib/pdfLetter'
import { useToast } from '@/components/ui/toast-context'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

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
 * and delete the visitor (with a confirmation).
 */
export function VisitorActions({
  visitor,
  hostName,
  purposeLabel,
  testPrefix = '',
}: {
  visitor: Visitor
  hostName?: string
  purposeLabel?: string
  testPrefix?: string
}) {
  const setPass = useSetVisitorPass()
  const remove = useDeleteVisitor()
  const toast = useToast()
  const [confirm, setConfirm] = useState<'delete' | 'remove-pass' | null>(null)
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
        data-testid={`${testPrefix}delete-visitor`}
        aria-label={`Delete visitor ${visitor.name}`}
        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        onClick={() => setConfirm('delete')}
      >
        <Trash2 className="size-4" />
      </button>

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
