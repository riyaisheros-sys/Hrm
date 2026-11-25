import { useMemo, useState } from 'react'
import { CalendarPlus, Check, ExternalLink, Pencil, Trash2, X } from 'lucide-react'
import {
  useCreateMeeting,
  useDeleteMeeting,
  useDirectory,
  useMeetings,
  useRespondToInvite,
  useUpdateMeeting,
  type MeetingRow,
} from './hooks'
import { useAuth } from '@/features/auth/auth-context'
import { useToast } from '@/components/ui/toast-context'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useProfile } from '@/features/rbac/profile-context'

const INVITE_TONE: Record<string, 'slate' | 'green' | 'red'> = {
  invited: 'slate',
  accepted: 'green',
  rejected: 'red',
  attended: 'green',
}

/** Internal meeting management — host meetings, invite colleagues, respond to invites. */
export function MeetingsSection() {
  const { user } = useAuth()
  const { data: meetings = [] } = useMeetings()
  const { data: directory = [] } = useDirectory()
  const respond = useRespondToInvite()
  const del = useDeleteMeeting()
  const toast = useToast()
  const { hasPermission } = useProfile()
  // Admins (visitors.manage) may edit / delete any meeting; hosts their own.
  const canManage = hasPermission('visitors.manage')
  const [hostModal, setHostModal] = useState(false)
  const [deleting, setDeleting] = useState<MeetingRow | null>(null)
  const askDelete = (id: string) => setDeleting(meetings.find((m) => m.id === id) ?? null)
  const [editing, setEditing] = useState<MeetingRow | null>(null)
  const askEdit = (id: string) => setEditing(meetings.find((m) => m.id === id) ?? null)

  const nameById = useMemo(
    () => new Map(directory.map((d) => [d.id, d.full_name || d.email])),
    [directory],
  )

  const [now] = useState(() => Date.now())
  const upcoming = meetings.filter((m) => new Date(m.ends_at ?? m.starts_at).getTime() >= now)
  const past = meetings.filter((m) => new Date(m.ends_at ?? m.starts_at).getTime() < now)

  return (
    <section className="mt-8" data-testid="meetings-section">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Meetings</h2>
        <Button data-testid="host-meeting-button" onClick={() => setHostModal(true)}>
          <CalendarPlus className="size-4" /> Host a meeting
        </Button>
      </div>

      {meetings.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          description="Host a meeting and invite your colleagues."
          testid="meetings-empty"
        />
      ) : (
        <div className="space-y-3">
          {upcoming.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2" data-testid="upcoming-meetings">
              {upcoming.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  meId={user?.id}
                  nameById={nameById}
                  onRespond={(rowId, status) =>
                    respond.mutate(
                      { inviteeRowId: rowId, status },
                      {
                        onSuccess: () => toast.success('Meeting attendance updated'),
                        onError: (err) => toast.error('Failed', (err as Error).message),
                      },
                    )
                  }
                  canManage={canManage}
                  onDelete={askDelete}
                  onEdit={askEdit}
                />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-slate-500">
                Past meetings ({past.length})
              </summary>
              <div className="mt-3 grid gap-3 opacity-70 md:grid-cols-2">
                {past.map((m) => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    meId={user?.id}
                    nameById={nameById}
                    onRespond={(rowId, status) =>
                      respond.mutate(
                        { inviteeRowId: rowId, status },
                        { onSuccess: () => toast.success('Meeting attendance updated') },
                      )
                    }
                    canManage={canManage}
                    onDelete={askDelete}
                    onEdit={askEdit}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {hostModal && <HostMeetingModal onClose={() => setHostModal(false)} />}
      {editing && <EditMeetingModal meeting={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete meeting"
          testid="delete-meeting-dialog"
          confirmLabel="Delete meeting"
          loading={del.isPending}
          onClose={() => setDeleting(null)}
          message={
            <p>
              Delete <span className="font-semibold text-slate-900">{deleting.title}</span> (
              {new Date(deleting.starts_at).toLocaleString()})? Invitees will no longer see it.
              This cannot be undone.
            </p>
          }
          onConfirm={() =>
            del.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('Meeting deleted')
                setDeleting(null)
              },
              onError: (err) => toast.error('Failed', (err as Error).message),
            })
          }
        />
      )}
    </section>
  )
}

function MeetingCard({
  meeting,
  meId,
  nameById,
  onRespond,
  onDelete,
  onEdit,
  canManage = false,
}: {
  canManage?: boolean
  meeting: MeetingRow
  meId?: string
  nameById: Map<string, string>
  onRespond?: (
    inviteeRowId: string,
    status: 'invited' | 'accepted' | 'rejected' | 'attended',
  ) => void
  onDelete?: (meetingId: string) => void
  onEdit?: (meetingId: string) => void
}) {
  const myInvite = meeting.meeting_invitees.find((i) => i.user_id === meId)
  const isHost = meeting.host_id === meId

  return (
    <Card data-testid="meeting-card">
      <CardBody className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900" data-testid="meeting-title">
              {meeting.title}
            </h3>
            <p className="text-xs text-slate-500">
              Hosted by {isHost ? 'you' : (nameById.get(meeting.host_id) ?? '—')}
            </p>
          </div>
          {(isHost || canManage) && (onEdit || onDelete) && (
            <div className="flex shrink-0 gap-1">
              {onEdit && (
                <button
                  type="button"
                  data-testid="edit-meeting"
                  aria-label={`Edit meeting ${meeting.title}`}
                  className="hover:text-brand-600 rounded p-1 text-slate-400"
                  onClick={() => onEdit(meeting.id)}
                >
                  <Pencil className="size-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  data-testid="delete-meeting"
                  aria-label={`Delete meeting ${meeting.title}`}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => onDelete(meeting.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {new Date(meeting.starts_at).toLocaleString()}
          {meeting.ends_at && ` → ${new Date(meeting.ends_at).toLocaleTimeString()}`}
        </p>
        {meeting.description && <p className="text-sm text-slate-600">{meeting.description}</p>}
        {meeting.meeting_link && (
          <a
            href={meeting.meeting_link}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="meeting-link"
            className="text-brand-600 inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            <ExternalLink className="size-3.5" /> Join link
          </a>
        )}
        <div className="flex flex-wrap gap-1" data-testid="meeting-invitees">
          {meeting.meeting_invitees.map((i) =>
            isHost && onRespond ? (
              <label key={i.id} className="flex items-center gap-1 text-xs">
                {nameById.get(i.user_id) ?? '—'}
                <Select
                  value={i.status}
                  onChange={(event) =>
                    onRespond(
                      i.id,
                      event.target.value as 'invited' | 'accepted' | 'rejected' | 'attended',
                    )
                  }
                  className="h-7 w-28"
                >
                  {['invited', 'accepted', 'rejected', 'attended'].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <Badge key={i.id} tone={INVITE_TONE[i.status] ?? 'slate'}>
                {nameById.get(i.user_id) ?? '—'} · {i.status}
              </Badge>
            ),
          )}
        </div>
        {myInvite && myInvite.status === 'invited' && onRespond && (
          <div className="flex gap-2 border-t border-slate-100 pt-2">
            <Button
              size="sm"
              data-testid="accept-invite"
              onClick={() => onRespond(myInvite.id, 'accepted')}
            >
              <Check className="size-4" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="decline-invite"
              onClick={() => onRespond(myInvite.id, 'rejected')}
            >
              <X className="size-4" /> Decline
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function HostMeetingModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { data: directory = [] } = useDirectory()
  const create = useCreateMeeting()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [invitees, setInvitees] = useState<Set<string>>(new Set())

  const colleagues = directory.filter((d) => d.id !== user?.id)

  function toggle(id: string) {
    setInvitees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal open onClose={onClose} title="Host a meeting" testid="host-meeting-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            {
              title: title.trim(),
              description: description.trim() || undefined,
              link: link.trim() || undefined,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
              inviteeIds: [...invitees],
            },
            {
              onSuccess: () => {
                toast.success('Meeting created', 'Invitations are visible to invitees immediately.')
                onClose()
              },
              onError: (err) => toast.error('Failed', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="mt-title">Title</Label>
          <Input
            id="mt-title"
            data-testid="meeting-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="mt-desc">Description</Label>
          <Textarea
            id="mt-desc"
            data-testid="meeting-desc-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="mt-link">Meeting link</Label>
          <Input
            id="mt-link"
            data-testid="meeting-link-input"
            type="url"
            placeholder="https://meet.example.com/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mt-start">Starts</Label>
            <Input
              id="mt-start"
              data-testid="meeting-start-input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="mt-end">Ends (optional)</Label>
            <Input
              id="mt-end"
              data-testid="meeting-end-input"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Invite colleagues</Label>
          <div
            className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2"
            data-testid="invitee-picker"
          >
            {colleagues.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  data-testid={`invite-${c.email}`}
                  checked={invitees.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                {c.full_name || c.email}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="create-meeting-submit" loading={create.isPending}>
            Create meeting
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** ISO timestamp → the local "YYYY-MM-DDTHH:mm" a datetime-local input expects. */
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EditMeetingModal({ meeting, onClose }: { meeting: MeetingRow; onClose: () => void }) {
  const update = useUpdateMeeting()
  const toast = useToast()
  const [title, setTitle] = useState(meeting.title)
  const [description, setDescription] = useState(meeting.description ?? '')
  const [link, setLink] = useState(meeting.meeting_link ?? '')
  const [startsAt, setStartsAt] = useState(toLocalInput(meeting.starts_at))
  const [endsAt, setEndsAt] = useState(toLocalInput(meeting.ends_at))

  return (
    <Modal open onClose={onClose} title="Edit meeting" testid="edit-meeting-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (endsAt && new Date(endsAt) < new Date(startsAt)) {
            toast.error('The meeting must end after it starts')
            return
          }
          update.mutate(
            {
              id: meeting.id,
              title: title.trim(),
              description: description.trim() || undefined,
              link: link.trim() || undefined,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
            },
            {
              onSuccess: () => {
                toast.success('Meeting updated')
                onClose()
              },
              onError: (err) => toast.error('Save failed', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="mt-edit-title">Title</Label>
          <Input
            id="mt-edit-title"
            data-testid="meeting-edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="mt-edit-desc">Description</Label>
          <Textarea
            id="mt-edit-desc"
            data-testid="meeting-edit-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="mt-edit-link">Meeting link</Label>
          <Input
            id="mt-edit-link"
            data-testid="meeting-edit-link"
            type="url"
            placeholder="https://meet.example.com/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mt-edit-start">Starts</Label>
            <Input
              id="mt-edit-start"
              data-testid="meeting-edit-start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="mt-edit-end">Ends (optional)</Label>
            <Input
              id="mt-edit-end"
              data-testid="meeting-edit-end"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="save-meeting" loading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
