import { useState } from 'react'
import { Eye, Pencil, Trash2, Unlock } from 'lucide-react'
import {
  planningCoverage,
  useDaySlotsForDate,
  usePlanningConfig,
  usePlanningRealtime,
  usePunchLockOverview,
  useUpdatePlanningConfig,
  useEditUnlock,
  useRemoveUnlock,
  useUnlockHistory,
  useUnlockPlanning,
  type UnlockHistoryEntry,
  useUserDayPlan,
} from './hooks'
import { useUsers } from '@/features/admin/users/hooks'
import { todayInTz } from '@/features/attendance/geo'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useProfile } from '@/features/rbac/profile-context'

export function PlanningAdminPage() {
  const { data: config } = usePlanningConfig()
  const [date, setDate] = useState(todayInTz('Asia/Kolkata'))
  const [employeeFilter, setEmployeeFilter] = useState('')
  const { data: users = [] } = useUsers()
  const { data: daySlots = [] } = useDaySlotsForDate(date)
  const { data: locks = [] } = usePunchLockOverview()
  const [viewUser, setViewUser] = useState<{ id: string; name: string } | null>(null)
  const [unlockUser, setUnlockUser] = useState<{ id: string; name: string; email: string } | null>(
    null,
  )

  usePlanningRealtime()

  const windowStart = config?.day_start?.slice(0, 5) ?? '10:00'
  const windowEnd = config?.day_end?.slice(0, 5) ?? '18:30'
  const slotsByUser = new Map<string, typeof daySlots>()
  for (const s of daySlots) {
    const list = slotsByUser.get(s.user_id) ?? []
    list.push(s)
    slotsByUser.set(s.user_id, list)
  }
  const lockByUser = new Map(locks.map((l) => [l.user_id, l]))
  const visibleUsers = employeeFilter ? users.filter((u) => u.id === employeeFilter) : users

  return (
    <div data-testid="planning-admin-page">
      <PageHeader
        title="Planning Monitor"
        description={`A day is planned when slots cover ${windowStart}–${windowEnd}. An unplanned last worked day locks punch-in until it's planned or unlocked with a remark.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="pa-date" className="mb-0">
            Date
          </Label>
          <Input id="pa-date" data-testid="planning-admin-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="pa-employee" className="mb-0">
            Employee
          </Label>
          <Select
            id="pa-employee"
            data-testid="planning-admin-employee"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
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
        <LateGraceSetting />
      </div>

      <Table data-testid="planning-compliance-table">
        <Thead>
          <tr>
            <Th>Employee</Th>
            <Th>Planning ({date})</Th>
            <Th>Punch Lock</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </Thead>
        <Tbody>
          {visibleUsers.map((u) => {
            const coverage = planningCoverage(slotsByUser.get(u.id) ?? [], windowStart, windowEnd)
            const lock = lockByUser.get(u.id)
            return (
              <tr key={u.id} data-testid={`compliance-row-${u.email}`}>
                <Td className="font-medium text-slate-900">{u.full_name || u.email}</Td>
                <Td>
                  <Badge
                    tone={coverage.covered ? 'green' : 'amber'}
                    data-testid={`compliance-${u.email}`}
                    data-compliant={coverage.covered}
                  >
                    {coverage.covered ? 'planned' : `pending from ${coverage.gapStart}`}
                  </Badge>
                </Td>
                <Td>
                  <Badge
                    tone={lock?.locked ? 'red' : 'green'}
                    data-testid={`punch-lock-${u.email}`}
                    data-locked={!!lock?.locked}
                  >
                    {lock?.locked ? `locked (${lock.prev_date ?? 'previous day'})` : 'clear'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <button
                      data-testid={`view-plan-${u.email}`}
                      aria-label={`View plan for ${u.full_name}`}
                      className="rounded p-1 text-slate-400 hover:text-brand-600"
                      onClick={() => setViewUser({ id: u.id, name: u.full_name || u.email })}
                    >
                      <Eye className="size-4" />
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`unlock-${u.email}`}
                      disabled={!lock?.locked}
                      onClick={() =>
                        setUnlockUser({ id: u.id, name: u.full_name || u.email, email: u.email })
                      }
                    >
                      <Unlock className="size-3.5" /> Unlock
                    </Button>
                  </div>
                </Td>
              </tr>
            )
          })}
        </Tbody>
      </Table>

      <UnlockHistory users={users} />

      {viewUser && <PlanView user={viewUser} date={date} onClose={() => setViewUser(null)} />}
      {unlockUser && <UnlockModal user={unlockUser} onClose={() => setUnlockUser(null)} />}
    </div>
  )
}

/** Unlocking overrides the punch lock, so it always needs a written reason. */
/**
 * How long after a slot ends an entry may still be written before it counts as
 * a late entry (shown red in reports, scored by Planning discipline).
 */
function LateGraceSetting() {
  const { data: config } = usePlanningConfig()
  const update = useUpdatePlanningConfig()
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  // The column arrives with a migration; until then the rule runs on 30 minutes.
  const available = !!config && 'late_entry_grace_minutes' in config
  const saved = String(
    (config as { late_entry_grace_minutes?: number } | undefined)?.late_entry_grace_minutes ?? 30,
  )
  const value = draft ?? saved
  const dirty = draft !== null && draft !== saved

  const save = () => {
    const minutes = Number(value)
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      toast.error('Enter whole minutes between 0 and 1440')
      return
    }
    update.mutate({ late_entry_grace_minutes: minutes } as never, {
      onSuccess: () => {
        toast.success(`Entries more than ${minutes} min after a slot ends now count as late`)
        setDraft(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <div
      className="ml-auto flex items-center gap-2"
      title="A planning entry written later than this after its slot ended is a late entry: red in reports and counted by the Planning discipline KRA / KPI."
    >
      <Label htmlFor="pa-late-grace" className="mb-0">
        Late entry after (min)
      </Label>
      <Input
        id="pa-late-grace"
        data-testid="planning-late-grace"
        type="number"
        min={0}
        max={1440}
        value={value}
        disabled={!available}
        onChange={(e) => setDraft(e.target.value)}
        className="w-20"
      />
      {dirty && (
        <Button
          size="sm"
          data-testid="planning-late-grace-save"
          onClick={save}
          disabled={update.isPending}
        >
          Save
        </Button>
      )}
    </div>
  )
}

function UnlockModal({
  user,
  onClose,
}: {
  user: { id: string; name: string; email: string }
  onClose: () => void
}) {
  const unlock = useUnlockPlanning()
  const toast = useToast()
  const [remarks, setRemarks] = useState('')

  return (
    <Modal open onClose={onClose} title={`Unlock punching: ${user.name}`} testid="unlock-modal">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          unlock.mutate(
            { userId: user.id, remarks: remarks.trim() },
            {
              onSuccess: () => {
                toast.success('Punch lock lifted')
                onClose()
              },
              onError: (err) => toast.error('Unlock failed', (err as Error).message),
            },
          )
        }}
      >
        <p className="text-sm text-slate-600">
          This lifts the punch lock for {user.name} — the last worked day that is blocking
          punch-in is unlocked, whichever day that is. A remark is required and kept on record.
        </p>
        <div>
          <Label htmlFor="unlock-remark">Remark</Label>
          <Textarea
            id="unlock-remark"
            data-testid="unlock-remark"
            rows={2}
            placeholder="Why is this being unlocked? (required)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="unlock-save"
            disabled={!remarks.trim()}
            loading={unlock.isPending}
          >
            <Unlock className="size-4" /> Unlock
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Record of every admin unlock — who was unlocked, for which day, by whom, and why. */
function UnlockHistory({
  users,
}: {
  users: { id: string; email: string; full_name: string | null }[]
}) {
  const { hasPermission } = useProfile()
  const canUnlock = hasPermission('attendance.unlock')
  // Default period: the last 30 days of unlocked dates.
  const [to, setTo] = useState(todayInTz('Asia/Kolkata'))
  const [from, setFrom] = useState(() => {
    const d = new Date(`${todayInTz('Asia/Kolkata')}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [userId, setUserId] = useState('')
  const { data: history = [], isLoading } = useUnlockHistory({ from, to, userId })
  const editUnlock = useEditUnlock()
  const removeUnlock = useRemoveUnlock()
  const toast = useToast()
  const [editing, setEditing] = useState<UnlockHistoryEntry | null>(null)
  const [remark, setRemark] = useState('')
  const [removing, setRemoving] = useState<UnlockHistoryEntry | null>(null)
  const [showLogic, setShowLogic] = useState(false)
  const nameOf = (id: string | null) => {
    const u = users.find((x) => x.id === id)
    return u ? u.full_name || u.email : '—'
  }

  return (
    <section className="mt-8" data-testid="unlock-history">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-slate-700">Unlock history</h2>
          <button
            type="button"
            className="text-brand-600 text-xs hover:underline"
            data-testid="unlock-logic-toggle"
            onClick={() => setShowLogic((v) => !v)}
          >
            {showLogic ? 'Hide how locking works' : 'How locking and unlocking work'}
          </button>
        </div>
        <div>
          <Label htmlFor="uh-from" className="text-xs text-slate-500">
            Unlocked day from
          </Label>
          <Input
            id="uh-from"
            data-testid="unlock-history-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        <div>
          <Label htmlFor="uh-to" className="text-xs text-slate-500">
            To
          </Label>
          <Input
            id="uh-to"
            data-testid="unlock-history-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        <div>
          <Label htmlFor="uh-user" className="text-xs text-slate-500">
            Employee
          </Label>
          <Select
            id="uh-user"
            data-testid="unlock-history-user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-9 w-48"
          >
            <option value="">All employees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </Select>
        </div>
        <Badge tone="blue" data-testid="unlock-history-count">
          {history.length} unlock{history.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {showLogic && (
        <div
          className="mb-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
          data-testid="unlock-logic"
        >
          <p>
            <span className="font-semibold text-slate-800">Lock:</span> when an employee punches in,
            the system checks their last worked day. If that day's planning slots do not cover the
            working window, punch-in (and new planning) is locked until the day is planned or an
            admin unlocks it.
          </p>
          <p>
            <span className="font-semibold text-slate-800">Unlock:</span> an admin unlocks with a
            remark. That day is marked as unlocked, the employee can punch in, and one row is added
            here.
          </p>
          <p>
            <span className="font-semibold text-slate-800">Edit:</span> changes only the remark.
          </p>
          <p>
            <span className="font-semibold text-slate-800">Remove:</span> undoes the unlock. The row is
            deleted and the day is no longer marked unlocked, so if its planning is still incomplete
            the employee is locked again. Edits and removals are kept in the Audit Log.
          </p>
          <p>
            The full lock / unlock report with counts is in Reports → Planning Lock / Unlock.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : history.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
          No unlocks in this period.
        </p>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>When</Th>
              <Th>Employee</Th>
              <Th>Unlocked day</Th>
              <Th>By</Th>
              <Th>Remark</Th>
              {canUnlock && <Th className="text-right">Actions</Th>}
            </tr>
          </Thead>
          <Tbody>
            {history.map((h) => (
              <tr key={h.id} data-testid="unlock-history-row">
                <Td className="whitespace-nowrap text-slate-500">
                  {new Date(h.created_at).toLocaleString()}
                </Td>
                <Td className="font-medium text-slate-900">{nameOf(h.user_id)}</Td>
                <Td>{h.work_date}</Td>
                <Td>{nameOf(h.unlocked_by)}</Td>
                <Td className="max-w-80 truncate" title={h.remarks}>
                  {h.remarks}
                </Td>
                {canUnlock && (
                  <Td>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        data-testid="unlock-edit"
                        aria-label={`Edit unlock remark for ${nameOf(h.user_id)}`}
                        className="hover:text-brand-600 rounded p-1 text-slate-400"
                        onClick={() => {
                          setEditing(h)
                          setRemark(h.remarks)
                        }}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        data-testid="unlock-remove"
                        aria-label={`Remove unlock for ${nameOf(h.user_id)}`}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setRemoving(h)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </Tbody>
        </Table>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit unlock remark" testid="unlock-edit-modal">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              editUnlock.mutate(
                { id: editing.id, remarks: remark },
                {
                  onSuccess: () => {
                    toast.success('Remark updated')
                    setEditing(null)
                  },
                  onError: (err) => toast.error('Could not update', (err as Error).message),
                },
              )
            }}
          >
            <p className="text-sm text-slate-600">
              {nameOf(editing.user_id)} · unlocked day {editing.work_date}
            </p>
            <Textarea
              data-testid="unlock-edit-remark"
              rows={3}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="unlock-edit-save" loading={editUnlock.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove unlock"
          testid="unlock-remove-dialog"
          confirmLabel="Remove unlock"
          loading={removeUnlock.isPending}
          onClose={() => setRemoving(null)}
          message={
            <div className="space-y-2">
              <p>
                Remove the unlock of{' '}
                <span className="font-semibold text-slate-900">{nameOf(removing.user_id)}</span> for{' '}
                {removing.work_date}?
              </p>
              <p className="text-xs text-slate-500">
                This undoes the unlock. If that day's planning is still incomplete and it is still
                their last worked day, punch-in will be locked again. The removal is kept in the
                Audit Log.
              </p>
            </div>
          }
          onConfirm={() =>
            removeUnlock.mutate(removing.id, {
              onSuccess: () => {
                toast.success('Unlock removed')
                setRemoving(null)
              },
              onError: (err) => toast.error('Could not remove', (err as Error).message),
            })
          }
        />
      )}
    </section>
  )
}

function PlanView({
  user,
  date,
  onClose,
}: {
  user: { id: string; name: string }
  date: string
  onClose: () => void
}) {
  const { data: slots = [] } = useUserDayPlan(user.id, date)
  const fields = [
    { key: 'slot', label: 'Slot' },
    { key: 'planning', label: 'Planning' },
    { key: 'working', label: 'Working' },
    { key: 'progress', label: 'Completion %' },
    { key: 'challenges', label: 'Challenges' },
  ] as const
  return (
    <Modal open onClose={onClose} title={`${user.name} · ${date}`} testid="plan-view-modal">
      {slots.length === 0 ? (
        <p className="text-sm text-slate-500">No planning recorded for this date.</p>
      ) : (
        <ul className="space-y-2">
          {slots.map((s) => {
            const values: Record<(typeof fields)[number]['key'], string> = {
              slot: s.slot_label,
              planning: s.task_name || '—',
              working: s.remarks || '—',
              progress: `${s.progress ?? 0}%`,
              challenges: s.challenges || '—',
            }
            return (
              <li
                key={s.id}
                data-testid="plan-view-slot"
                className="rounded-lg border border-slate-100 p-3 text-sm"
              >
                <dl className="grid grid-cols-[7rem_1fr] gap-y-0.5">
                  {fields.map((f) => (
                    <div key={f.key} className="contents">
                      <dt className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                        {f.label}
                      </dt>
                      <dd
                        className={
                          f.key === 'challenges' && s.challenges
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }
                        data-testid={`plan-view-${f.key}`}
                      >
                        {values[f.key]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
