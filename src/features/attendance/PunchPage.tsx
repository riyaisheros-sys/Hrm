import { useState } from 'react'
import { Clock, Fingerprint, Lock, MapPin } from 'lucide-react'
import { useAttendanceConfig, useMyAttendance, type PunchResult } from './hooks'
import { usePlanningConfig, usePunchInLock } from '@/features/planning/hooks'
import { SelfiePunchModal } from './SelfiePunchModal'
import { todayInTz, formatMinutes } from './geo'
import { ATTENDANCE_STATUS, formatLateBy } from './status'
import { formatDate, formatTime } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/toast-context'
import { Modal } from '@/components/ui/Modal'

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ATTENDANCE_STATUS).map(([k, v]) => [k, v.label]),
)

const hrs = (h: number) => `${h} h`

export function PunchPage() {
  const { data: config } = useAttendanceConfig()
  const tz = config?.timezone ?? 'Asia/Kolkata'
  const workDate = todayInTz(tz)
  const { data, isLoading } = useMyAttendance(workDate)
  const toast = useToast()
  const [modalType, setModalType] = useState<'in' | 'out' | null>(null)
  const [summary, setSummary] = useState<PunchResult | null>(null)

  const open = data?.open ?? false
  const day = data?.day
  const punches = data?.punches ?? []
  const { data: lock } = usePunchInLock()
  const { data: planConfig } = usePlanningConfig()
  const locked = !open && !!lock?.locked
  const windowStart = planConfig?.day_start?.slice(0, 5) ?? '10:00'
  const windowEnd = planConfig?.day_end?.slice(0, 5) ?? '18:30'

  function handleSuccess(res: PunchResult) {
    setModalType(null)
    if (res.punch_type === 'out') {
      // Show the end-of-day summary so the employee sees their final
      // attendance status, worked time, late / OT in one place.
      setSummary(res)
    } else {
      toast.success('Punched in', 'Have a good day.')
    }
  }

  return (
    <div data-testid="attendance-page">
      <PageHeader title="My Attendance" description={`Today · ${formatDate(workDate)}`} />

      {locked && (
        <div
          data-testid="punch-lock-banner"
          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-semibold">Punch-in locked.</span> Your planning for{' '}
            {lock?.prev_date ? formatDate(lock.prev_date) : 'your last worked day'} is incomplete — add slots on the Planning
            page covering the full working day ({windowStart}–{windowEnd}). Punch-in stays blocked
            every day until that day is fully planned or an admin unlocks it.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardBody className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Today’s status</p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  data-testid="today-status"
                  data-status={day?.status ?? 'none'}
                  className="text-xl font-bold text-slate-900"
                >
                  {day ? (STATUS_LABEL[day.status] ?? day.status) : 'Not started'}
                </span>
                {day?.is_late && (
                  <Badge tone="amber" data-testid="today-late">
                    Late by {formatLateBy(day.late_minutes)}
                  </Badge>
                )}
                {(day?.overtime_minutes ?? 0) > 0 && <Badge tone="blue">OT</Badge>}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="size-4 text-slate-400" />
              Worked: <span data-testid="today-worked" className="font-semibold text-slate-900">
                {formatMinutes(day?.worked_minutes ?? 0)}
              </span>
            </div>

            <Button
              size="lg"
              className="w-full"
              data-testid="punch-button"
              variant={open ? 'danger' : 'primary'}
              onClick={() => setModalType(open ? 'out' : 'in')}
            >
              <Fingerprint className="size-5" />
              {open ? 'Punch Out' : 'Punch In'}
            </Button>

            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <MapPin className="size-3" />
              Requires location within {config?.radius_meters ?? 50} m of the office. A live selfie
              is captured.
            </p>

            {config && (
              <p className="text-xs text-slate-400" data-testid="attendance-thresholds">
                Full day {hrs(config.full_day_hours)} · Half day {hrs(config.half_day_hours)} ·
                Quarter day {hrs(config.quarter_day_hours)} (including a {config.break_minutes} min
                break). Below that the day counts as absent. Punching in up to{' '}
                {config.grace_minutes} min after {config.work_start.slice(0, 5)} is not marked late.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="mb-3 text-sm font-medium text-slate-500">Today’s punches</p>
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : punches.length === 0 ? (
              <EmptyState title="No punches yet today" testid="punches-empty" />
            ) : (
              <ul className="space-y-2" data-testid="punches-list">
                {punches.map((p) => (
                  <li
                    key={p.id}
                    data-testid="punch-row"
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Badge tone={p.punch_type === 'in' ? 'green' : 'slate'}>
                        {p.punch_type === 'in' ? 'IN' : 'OUT'}
                      </Badge>
                      {formatTime(p.punched_at)}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-slate-500">
                      {p.distance_meters != null && <span>{Math.round(p.distance_meters)} m</span>}
                      {p.selfie_path && <span data-testid="punch-selfie">📷</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {modalType && (
        <SelfiePunchModal
          type={modalType}
          onClose={() => setModalType(null)}
          onSuccess={handleSuccess}
        />
      )}

      {summary && (
        <PunchOutSummaryModal summary={summary} onClose={() => setSummary(null)} />
      )}
    </div>
  )
}

function PunchOutSummaryModal({
  summary,
  onClose,
}: {
  summary: PunchResult
  onClose: () => void
}) {
  const statusKey = summary.status ?? ''
  const statusMeta = ATTENDANCE_STATUS[statusKey]
  const statusLabel = STATUS_LABEL[statusKey] ?? statusKey ?? '—'
  const worked = summary.worked_minutes ?? 0
  const late = summary.is_late ? (summary.late_minutes ?? 0) : 0
  const ot = summary.overtime_minutes ?? 0
  return (
    <Modal open onClose={onClose} title="You're punched out" testid="punchout-summary-modal">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">Today's attendance</p>
          <p
            data-testid="punchout-status"
            data-status={statusKey}
            className="mt-1 inline-block rounded-full px-3 py-1 text-base font-bold"
            style={
              statusMeta
                ? {
                    background: `rgb(${statusMeta.rgb[0]}, ${statusMeta.rgb[1]}, ${statusMeta.rgb[2]})`,
                    color: '#fff',
                  }
                : { background: '#334155', color: '#fff' }
            }
          >
            {statusLabel}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">Worked</dt>
            <dd data-testid="punchout-worked" className="text-lg font-semibold text-slate-900">
              {formatMinutes(worked)}
            </dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">Late by</dt>
            <dd data-testid="punchout-late" className="text-lg font-semibold text-slate-900">
              {late > 0 ? formatLateBy(late) : '—'}
            </dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">Overtime</dt>
            <dd data-testid="punchout-overtime" className="text-lg font-semibold text-slate-900">
              {ot > 0 ? formatMinutes(ot) : '—'}
            </dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">Flags</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {summary.is_late && <Badge tone="amber">Late</Badge>}
              {ot > 0 && <Badge tone="blue">OT</Badge>}
              {!summary.is_late && ot === 0 && <span className="text-sm text-slate-500">—</span>}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-slate-500">
          This is your attendance for today based on your punches. See the full day on My
          Attendance.
        </p>
        <div className="flex justify-end">
          <Button data-testid="punchout-summary-close" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </Modal>
  )
}
