import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Save } from 'lucide-react'
import { useAttendanceConfig, useUpdateAttendanceConfig } from './hooks'
import { useProfile } from '@/features/rbac/profile-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/toast-context'

type Form = {
  work_start: string
  work_end: string
  count_within_work_hours: boolean
  lunch_start: string
  lunch_end: string
  exclude_lunch: boolean
  full_day_hours: string
  half_day_hours: string
  quarter_day_hours: string
  grace_minutes: string
  break_minutes: string
  overtime_after_hours: string
  radius_meters: string
  location_accuracy_cap_m: string
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
const minutesBetween = (from: string, to: string) => {
  if (!from || !to) return 0
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  return th * 60 + tm - (fh * 60 + fm)
}
const asHours = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

/**
 * One place for every rule that decides how a day's attendance is counted:
 * working hours, lunch, day thresholds, grace / breaks / overtime and the
 * geo-fence. Changes apply to days counted after saving; past days keep the
 * status they already have.
 */
export function AttendanceSettingsPage() {
  const { data: config, isLoading } = useAttendanceConfig()
  const { hasPermission } = useProfile()
  const canEdit = hasPermission('attendance.edit') || hasPermission('attendance.manage')
  if (isLoading || !config) return <p className="text-sm text-slate-500">Loading…</p>
  // The lunch / working-window columns arrive with a database update.
  const supported = 'count_within_work_hours' in config
  return <SettingsForm key={config.updated_at} config={config} canEdit={canEdit} supported={supported} />
}

function SettingsForm({
  config,
  canEdit,
  supported,
}: {
  config: NonNullable<ReturnType<typeof useAttendanceConfig>['data']>
  canEdit: boolean
  supported: boolean
}) {
  const update = useUpdateAttendanceConfig()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const initial: Form = {
    work_start: hhmm(config.work_start),
    work_end: hhmm(config.work_end),
    count_within_work_hours: !!config.count_within_work_hours,
    lunch_start: hhmm(config.lunch_start),
    lunch_end: hhmm(config.lunch_end),
    exclude_lunch: !!config.exclude_lunch,
    full_day_hours: String(config.full_day_hours),
    half_day_hours: String(config.half_day_hours),
    quarter_day_hours: String(config.quarter_day_hours),
    grace_minutes: String(config.grace_minutes),
    break_minutes: String(config.break_minutes),
    overtime_after_hours: String(config.overtime_after_hours),
    radius_meters: String(config.radius_meters),
    location_accuracy_cap_m: String(config.location_accuracy_cap_m),
  }
  const [form, setForm] = useState<Form>(initial)
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = (Object.keys(initial) as Array<keyof Form>).some((k) => form[k] !== initial[k])

  // What a full office day adds up to under the chosen rules — shown so the
  // admin can see whether the Full-day threshold is still reachable.
  const windowMin = minutesBetween(form.work_start, form.work_end)
  const lunchMin =
    form.exclude_lunch && form.lunch_start && form.lunch_end
      ? Math.max(0, minutesBetween(form.lunch_start, form.lunch_end))
      : 0
  const countable = Math.max(0, windowMin - lunchMin)
  const fullDayMin = Math.round(Number(form.full_day_hours || 0) * 60)
  const graceMin = Number(form.grace_minutes || 0)
  const unreachable =
    (form.count_within_work_hours || form.exclude_lunch) && countable + graceMin < fullDayMin

  const problems: string[] = []
  if (windowMin <= 0) problems.push('Working hours: the end time must be after the start time.')
  if (form.exclude_lunch && (!form.lunch_start || !form.lunch_end))
    problems.push('Lunch: set both a start and an end time to exclude lunch.')
  if (form.lunch_start && form.lunch_end && minutesBetween(form.lunch_start, form.lunch_end) <= 0)
    problems.push('Lunch: the end time must be after the start time.')
  const h = [form.full_day_hours, form.half_day_hours, form.quarter_day_hours].map(Number)
  if (!(h[0] > h[1] && h[1] > h[2] && h[2] > 0))
    problems.push('Day thresholds must go Full day > Half day > Quarter day > 0.')

  function save() {
    const patch: Record<string, unknown> = {
      work_start: form.work_start,
      work_end: form.work_end,
      full_day_hours: Number(form.full_day_hours),
      half_day_hours: Number(form.half_day_hours),
      quarter_day_hours: Number(form.quarter_day_hours),
      grace_minutes: Math.max(0, Math.round(Number(form.grace_minutes))),
      break_minutes: Math.max(0, Math.round(Number(form.break_minutes))),
      overtime_after_hours: Number(form.overtime_after_hours),
      radius_meters: Math.max(1, Math.round(Number(form.radius_meters))),
      location_accuracy_cap_m: Math.max(1, Math.round(Number(form.location_accuracy_cap_m))),
    }
    if (supported) {
      patch.count_within_work_hours = form.count_within_work_hours
      patch.exclude_lunch = form.exclude_lunch
      patch.lunch_start = form.lunch_start || null
      patch.lunch_end = form.lunch_end || null
    }
    update.mutate(patch as never, {
      onSuccess: () => {
        toast.success('Attendance settings saved', 'They apply to attendance counted from now on.')
        setConfirming(false)
      },
      onError: (err) => {
        toast.error('Save failed', (err as Error).message)
        setConfirming(false)
      },
    })
  }

  return (
    <div data-testid="attendance-settings-page">
      <PageHeader
        title="Attendance Settings"
        description="Working hours, lunch, day thresholds and location rules that decide how each day's attendance is counted."
        actions={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" disabled={!dirty} onClick={() => setForm(initial)}>
                Cancel
              </Button>
              <Button
                data-testid="attendance-settings-save"
                disabled={!dirty || problems.length > 0}
                onClick={() => setConfirming(true)}
              >
                <Save className="size-4" /> Save
              </Button>
            </div>
          )
        }
      />

      {!canEdit && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          You can view these settings but not change them.
        </p>
      )}
      {problems.length > 0 && (
        <ul
          className="mb-4 list-disc rounded-lg border border-red-200 bg-red-50 py-2 pr-3 pl-7 text-sm text-red-700"
          data-testid="attendance-settings-problems"
        >
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="1. Working hours"
          hint="The office day. Late arrival is measured from the start time."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day starts" id="set-work-start">
              <Input
                id="set-work-start"
                data-testid="set-work-start"
                type="time"
                disabled={!canEdit}
                value={form.work_start}
                onChange={(e) => set('work_start', e.target.value)}
              />
            </Field>
            <Field label="Day ends" id="set-work-end">
              <Input
                id="set-work-end"
                data-testid="set-work-end"
                type="time"
                disabled={!canEdit}
                value={form.work_end}
                onChange={(e) => set('work_end', e.target.value)}
              />
            </Field>
          </div>
          <Switch
            testid="set-count-window"
            disabled={!canEdit || !supported}
            checked={form.count_within_work_hours}
            onChange={(v) => set('count_within_work_hours', v)}
            label="Count attendance only within these working hours"
            hint={
              supported
                ? 'On: time before the start or after the end is not counted, so coming early or staying late does not make up for a late start or early exit. Overtime is still measured on the real time at work. Off: every minute between punch-in and punch-out counts.'
                : 'Not available yet — the database update for this option has not been applied.'
            }
          />
        </Section>

        <Section title="2. Lunch" hint="The lunch break window.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lunch starts" id="set-lunch-start">
              <Input
                id="set-lunch-start"
                data-testid="set-lunch-start"
                type="time"
                disabled={!canEdit || !supported}
                value={form.lunch_start}
                onChange={(e) => set('lunch_start', e.target.value)}
              />
            </Field>
            <Field label="Lunch ends" id="set-lunch-end">
              <Input
                id="set-lunch-end"
                data-testid="set-lunch-end"
                type="time"
                disabled={!canEdit || !supported}
                value={form.lunch_end}
                onChange={(e) => set('lunch_end', e.target.value)}
              />
            </Field>
          </div>
          <Switch
            testid="set-exclude-lunch"
            disabled={!canEdit || !supported}
            checked={form.exclude_lunch}
            onChange={(v) => set('exclude_lunch', v)}
            label="Do not count lunch time"
            hint={
              supported
                ? 'On: the lunch window is removed from the hours counted, whether or not the employee punches out, and the break allowance below is no longer added back. Off: lunch counts as it does today.'
                : 'Not available yet — the database update for this option has not been applied.'
            }
          />
        </Section>

        <Section
          title="3. Day thresholds"
          hint="Hours counted in a day decide Full day, Half day, Quarter day or Absent."
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Full day (hrs)" id="set-full">
              <Input
                id="set-full"
                data-testid="set-full-day"
                type="number"
                step="0.25"
                min="0"
                disabled={!canEdit}
                value={form.full_day_hours}
                onChange={(e) => set('full_day_hours', e.target.value)}
              />
            </Field>
            <Field label="Half day (hrs)" id="set-half">
              <Input
                id="set-half"
                type="number"
                step="0.25"
                min="0"
                disabled={!canEdit}
                value={form.half_day_hours}
                onChange={(e) => set('half_day_hours', e.target.value)}
              />
            </Field>
            <Field label="Quarter day (hrs)" id="set-quarter">
              <Input
                id="set-quarter"
                type="number"
                step="0.01"
                min="0"
                disabled={!canEdit}
                value={form.quarter_day_hours}
                onChange={(e) => set('quarter_day_hours', e.target.value)}
              />
            </Field>
          </div>
          <div
            data-testid="attendance-settings-summary"
            className={
              'rounded-md border px-3 py-2 text-xs ' +
              (unreachable
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-600')
            }
          >
            Office day {form.work_start}–{form.work_end} = {asHours(Math.max(0, windowMin))}
            {lunchMin > 0 && <> − lunch {asHours(lunchMin)}</>} ={' '}
            <strong>{asHours(countable)}</strong> countable.
            {unreachable && (
              <>
                {' '}
                A Full day needs {asHours(fullDayMin)}, which nobody can reach under these rules —
                lower the Full day hours (for example to {(countable / 60).toFixed(2)}) or everyone
                will be marked Half day.
              </>
            )}
          </div>
        </Section>

        <Section title="4. Grace, breaks and overtime">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Grace (min)" id="set-grace">
              <Input
                id="set-grace"
                type="number"
                min="0"
                disabled={!canEdit}
                value={form.grace_minutes}
                onChange={(e) => set('grace_minutes', e.target.value)}
              />
            </Field>
            <Field label="Break allowance (min)" id="set-break">
              <Input
                id="set-break"
                type="number"
                min="0"
                disabled={!canEdit || form.exclude_lunch}
                value={form.break_minutes}
                onChange={(e) => set('break_minutes', e.target.value)}
              />
            </Field>
            <Field label="Overtime after (hrs)" id="set-ot">
              <Input
                id="set-ot"
                type="number"
                step="0.25"
                min="0"
                disabled={!canEdit}
                value={form.overtime_after_hours}
                onChange={(e) => set('overtime_after_hours', e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Grace is the lateness allowed before a day is marked Late, and the shortfall allowed on
            each threshold. Break allowance is the time between a punch-out and the next punch-in
            that is still counted
            {form.exclude_lunch ? ' — not used while "Do not count lunch time" is on.' : '.'}
          </p>
        </Section>

        <Section title="5. Location (geo-fence)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Punch radius (m)" id="set-radius">
              <Input
                id="set-radius"
                type="number"
                min="1"
                disabled={!canEdit}
                value={form.radius_meters}
                onChange={(e) => set('radius_meters', e.target.value)}
              />
            </Field>
            <Field label="GPS accuracy cap (m)" id="set-accuracy">
              <Input
                id="set-accuracy"
                type="number"
                min="1"
                disabled={!canEdit}
                value={form.location_accuracy_cap_m}
                onChange={(e) => set('location_accuracy_cap_m', e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Office locations are managed in{' '}
            <Link to="/admin/attendance" className="text-brand-600 hover:underline">
              Attendance Monitor → Locations
            </Link>
            .
          </p>
        </Section>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Save attendance settings"
          testid="attendance-settings-confirm"
          confirmLabel="Save"
          loading={update.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={save}
          message={
            <div className="space-y-1">
              <p>
                These rules decide every employee's attendance status, which also feeds salary.
              </p>
              <p>
                They apply to attendance counted from now on. Days already recorded keep their
                current status.
              </p>
              {unreachable && (
                <p className="font-medium text-amber-700">
                  Warning: with these rules a Full day cannot be reached.
                </p>
              )}
            </div>
          }
        />
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        {children}
      </CardBody>
    </Card>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs text-slate-500">
        {label}
      </Label>
      {children}
    </div>
  )
}

function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
  testid,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint: string
  disabled?: boolean
  testid: string
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <input
        type="checkbox"
        className="accent-brand-600 mt-0.5"
        data-testid={testid}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  )
}
