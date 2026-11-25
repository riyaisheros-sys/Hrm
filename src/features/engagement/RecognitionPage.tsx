import { useState } from 'react'
import { Award, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  useAwardRecognition,
  useDeleteRecognition,
  useRecognitions,
  useUpdateRecognition,
} from './hooks'
import { usePeople } from '@/lib/people'
import { useAddMasterOption, useMasterOptions, type MasterOption } from '@/lib/masterOptions'
import { useProfile } from '@/features/rbac/profile-context'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/format'

// Used only until the Recognition Awards master exists on the database.
const FALLBACK_AWARDS: MasterOption[] = [
  { code: 'star_performer', name: 'Star Performer', points: 20 },
  { code: 'employee_of_month', name: 'Employee of the Month', points: 50 },
  { code: 'appreciation', name: 'Appreciation', points: 10 },
]

type RecognitionRow = {
  id: string
  employee_id: string
  award_type: string
  points: number
  note: string | null
  created_at: string
  awarded_by: string | null
}

export function RecognitionPage() {
  const { hasPermission } = useProfile()
  const canManage = hasPermission('recognition.manage')
  const { data: items = [] } = useRecognitions()
  const { data: users = [] } = usePeople()
  const awards = useMasterOptions('recognition_awards', FALLBACK_AWARDS)
  const nameById = new Map(users.map((u) => [u.id, u.full_name || u.email]))
  const [editing, setEditing] = useState<RecognitionRow | 'new' | null>(null)
  const [deleting, setDeleting] = useState<RecognitionRow | null>(null)
  const remove = useDeleteRecognition()
  const toast = useToast()

  return (
    <div data-testid="recognition-page">
      <PageHeader
        title="Recognition & Rewards"
        description="Celebrate great work. Award types are managed in Centralized Masters → Recognition Awards."
        actions={
          canManage && (
            <Button data-testid="award-button" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Award
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        <EmptyState title="No recognitions yet" testid="recognition-empty" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(items as RecognitionRow[]).map((r) => (
            <Card key={r.id} data-testid="recognition-card">
              <CardBody>
                <div className="flex items-start gap-2">
                  <Award className="mt-0.5 size-5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-semibold text-slate-900"
                        data-testid="recognition-employee"
                      >
                        {nameById.get(r.employee_id) ?? '—'}
                      </span>
                      <Badge tone="amber">{awards.labelOf(r.award_type)}</Badge>
                      {r.points > 0 && <Badge tone="brand">{r.points} pts</Badge>}
                    </div>
                    {r.note && <p className="mt-2 text-sm text-slate-600">{r.note}</p>}
                    <p className="mt-2 text-xs text-slate-400">
                      {formatDate(r.created_at)}
                      {r.awarded_by && nameById.get(r.awarded_by)
                        ? ` · by ${nameById.get(r.awarded_by)}`
                        : ''}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        data-testid="recognition-edit"
                        aria-label="Edit recognition"
                        className="hover:text-brand-600 rounded p-1 text-slate-400"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        data-testid="recognition-delete"
                        aria-label="Delete recognition"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <AwardModal
          users={users.filter((u) => u.status === 'active')}
          awards={awards.options}
          canAddAward={awards.fromMaster}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete recognition"
          testid="recognition-delete-dialog"
          confirmLabel="Delete"
          loading={remove.isPending}
          onClose={() => setDeleting(null)}
          message={
            <p>
              Delete the {awards.labelOf(deleting.award_type)} recognition of{' '}
              <span className="font-semibold text-slate-900">
                {nameById.get(deleting.employee_id) ?? 'this employee'}
              </span>
              ? This cannot be undone.
            </p>
          }
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('Recognition deleted')
                setDeleting(null)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
    </div>
  )
}

function AwardModal({
  users,
  awards,
  canAddAward,
  existing,
  onClose,
}: {
  users: { id: string; full_name: string; email: string }[]
  awards: MasterOption[]
  canAddAward: boolean
  existing: RecognitionRow | null
  onClose: () => void
}) {
  const award = useAwardRecognition()
  const update = useUpdateRecognition()
  const addAward = useAddMasterOption('recognition_awards')
  const toast = useToast()
  const [employeeId, setEmployeeId] = useState(existing?.employee_id ?? users[0]?.id ?? '')
  const [awardType, setAwardType] = useState(existing?.award_type ?? awards[0]?.code ?? '')
  const [points, setPoints] = useState(String(existing?.points ?? awards[0]?.points ?? 10))
  const [note, setNote] = useState(existing?.note ?? '')
  const [newAward, setNewAward] = useState<string | null>(null)
  const pending = award.isPending || update.isPending

  const pickAward = (code: string) => {
    setAwardType(code)
    const p = awards.find((a) => a.code === code)?.points
    if (p != null && !existing) setPoints(String(p))
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit recognition' : 'Award recognition'}
      testid="recognition-modal"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!employeeId || !awardType) {
            toast.error('Pick an employee and an award')
            return
          }
          const input = { employeeId, awardType, points: Number(points) || 0, note }
          const done = {
            onSuccess: () => {
              toast.success(existing ? 'Recognition updated' : 'Recognition awarded')
              onClose()
            },
            onError: (err: unknown) => toast.error('Failed', (err as Error).message),
          }
          if (existing) update.mutate({ id: existing.id, ...input }, done)
          else award.mutate(input, done)
        }}
      >
        <div>
          <Label htmlFor="rec-emp">Employee</Label>
          <Select
            id="rec-emp"
            data-testid="recognition-employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="rec-type">Award</Label>
              {canAddAward && newAward === null && (
                <button
                  type="button"
                  data-testid="recognition-new-award"
                  className="text-brand-600 text-xs font-medium hover:underline"
                  onClick={() => setNewAward('')}
                >
                  + New award
                </button>
              )}
            </div>
            <Select
              id="rec-type"
              data-testid="recognition-award-type"
              value={awardType}
              onChange={(e) => pickAward(e.target.value)}
            >
              {awards.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
              {existing && !awards.some((a) => a.code === existing.award_type) && (
                <option value={existing.award_type}>{existing.award_type.replace(/_/g, ' ')}</option>
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="rec-pts">Points</Label>
            <Input
              id="rec-pts"
              data-testid="recognition-points"
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
        </div>
        {newAward !== null && (
          <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex-1">
              <Label htmlFor="rec-new-award" className="text-xs">
                New award name
              </Label>
              <Input
                id="rec-new-award"
                data-testid="recognition-new-award-name"
                value={newAward}
                onChange={(e) => setNewAward(e.target.value)}
                placeholder="e.g. Best Team Player"
              />
            </div>
            <Button
              type="button"
              size="sm"
              data-testid="recognition-new-award-save"
              loading={addAward.isPending}
              onClick={() =>
                addAward.mutate(
                  { name: newAward, points: Number(points) || 10 },
                  {
                    onSuccess: (code) => {
                      toast.success('Award created', 'It is now in Centralized Masters too.')
                      setAwardType(code)
                      setNewAward(null)
                    },
                    onError: (err) => toast.error('Could not create award', (err as Error).message),
                  },
                )
              }
            >
              Create
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setNewAward(null)}>
              Cancel
            </Button>
          </div>
        )}
        <div>
          <Label htmlFor="rec-note">Note</Label>
          <Input
            id="rec-note"
            data-testid="recognition-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="award-recognition" loading={pending}>
            {existing ? 'Save' : 'Award'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
