import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
  AlarmClock,
  Award,
  BookText,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarRange,
  Check,
  ClipboardList,
  Clock,
  GraduationCap,
  IdCard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  Package,
  Plane,
  Settings2,
  TriangleAlert,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react'
import { useUsers } from '@/features/admin/users/hooks'
import { useDepartments } from '@/features/admin/hierarchy/hooks'
import { useAdminAttendance, useAttendanceConfig } from '@/features/attendance/hooks'
import { todayInTz } from '@/features/attendance/geo'
import { useAttendanceRoster } from '@/features/attendance/roster'
import { usePendingApprovals } from '@/features/leave/hooks'
import type { LeaveRequestRow } from '@/features/leave/hooks'
import { LeaveDecisionModal } from '@/features/leave/LeaveDecisionModal'
import { useTasks } from '@/features/tasks/hooks'
import { useTickets, isSlaBreached } from '@/features/helpdesk/hooks'
import { useAnnouncements, useMeetings, useVisitors } from '@/features/engagement/hooks'
import { useAppraisals } from '@/features/appraisal/hooks'
import { usePolicies, useMyAcknowledgements } from '@/features/policy/hooks'
import { useActiveAssignments } from '@/features/assets/hooks'
import { getTaskDelay } from '@/features/tasks/delay'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/toast-context'
import { DashboardCustomizer } from './DashboardCustomizer'
import { useDashboardPreferences } from './dashboard-preferences'

import { ADMIN_WIDGET_CATALOG, WIDE_WIDGET_IDS } from './widget-catalog'
const ADMIN_WIDGETS = ADMIN_WIDGET_CATALOG

function Stat({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  to,
}: {
  label: string
  value: number | string
  icon: typeof Users
  tone?: 'brand' | 'green' | 'amber' | 'red' | 'blue'
  to?: string
}) {
  const toneCls: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
  }
  const body = (
    <CardBody className="flex items-center gap-4">
      <div className={`flex size-11 items-center justify-center rounded-lg ${toneCls[tone]}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </CardBody>
  )
  return (
    <Card className={to ? 'transition-shadow hover:shadow-md' : undefined}>
      {to ? <Link to={to}>{body}</Link> : body}
    </Card>
  )
}

function SectionCard({
  title,
  to,
  linkLabel,
  children,
  testid,
}: {
  title: string
  to?: string
  linkLabel?: string
  children: React.ReactNode
  testid?: string
}) {
  return (
    <Card>
      <CardBody data-testid={testid}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {to && (
            <Link to={to} className="text-brand-600 text-xs font-medium hover:underline">
              {linkLabel ?? 'View all'}
            </Link>
          )}
        </div>
        {children}
      </CardBody>
    </Card>
  )
}

function useRecruitmentCount() {
  const { data = 0 } = useQuery({
    queryKey: ['candidates-count-active'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .in('status', ['applied', 'interview', 'selected'])
      if (error) return 0
      return count ?? 0
    },
  })
  return data
}

function useInterviewsTodayCount(today: string) {
  const { data = 0 } = useQuery({
    queryKey: ['interviews-today-count', today],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_at', `${today}T00:00:00`)
        .lte('scheduled_at', `${today}T23:59:59`)
      if (error) return 0
      return count ?? 0
    },
  })
  return data
}

function useUnackedPolicyCount(policyIds: string[], myAcks: Set<string>) {
  const { data = 0 } = useQuery({
    queryKey: ['unack-count', policyIds.join('|'), myAcks.size],
    enabled: policyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policy_versions')
        .select('id,policy_id,version')
        .in('policy_id', policyIds)
        .order('version', { ascending: false })
      if (error) return 0
      // Latest version per policy
      const latest = new Map<string, string>()
      for (const v of data ?? []) {
        if (!latest.has(v.policy_id)) latest.set(v.policy_id, v.id)
      }
      let unack = 0
      for (const id of latest.values()) if (!myAcks.has(id)) unack++
      return unack
    },
  })
  return data
}

export function AdminDashboard() {
  const [customizing, setCustomizing] = useState(false)
  const [leaveDecision, setLeaveDecision] = useState<{
    request: LeaveRequestRow
    decision: 'approved' | 'rejected'
  } | null>(null)
  const toast = useToast()
  const { preferences, save } = useDashboardPreferences(
    'admin',
    ADMIN_WIDGETS.map((widget) => widget.id),
  )
  const { data: config } = useAttendanceConfig()
  const tz = config?.timezone ?? 'Asia/Kolkata'
  const realToday = todayInTz(tz)
  // "There will be a date and calendar selector as per that dashboard data
  // will show" — admin picks a date (defaults to today) and every date-scoped
  // query here re-runs for it.
  const [selectedDate, setSelectedDate] = useState(realToday)
  const today = selectedDate

  const { data: users = [] } = useUsers()
  const { data: departments = [] } = useDepartments()
  const { data: attendance = [] } = useAdminAttendance(today, today)
  const { data: pendingLeaves = [] } = usePendingApprovals()
  const { data: tasks = [] } = useTasks()
  const { data: tickets = [] } = useTickets()
  const { data: announcements = [] } = useAnnouncements()
  const { data: appraisals = [] } = useAppraisals(null)
  const { data: policies = [] } = usePolicies()
  const { data: myAcks = [] } = useMyAcknowledgements()
  const { data: visitors = [] } = useVisitors()
  const { data: meetings = [] } = useMeetings()
  const { data: assetAssignments } = useActiveAssignments()

  const presentToday = attendance.filter((r) => r.status !== 'absent').length
  const lateToday = attendance.filter((r) => r.is_late).length
  const openTasks = tasks.filter((t) => !t.status?.is_terminal).length
  const openTickets = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length
  const breachedTickets = tickets.filter(isSlaBreached).length
  // Absent = attendance rows marked absent + expected employees with no punch.
  // "Expected" comes from the shared roster rule (also used by the Attendance
  // Monitor): not on a Sunday / holiday, not on approved full-day leave, and
  // not an account that never marks attendance (owners / directors).
  const roster = useAttendanceRoster(
    today,
    attendance.map((r) => r.user_id),
  )
  // Absent = not at work: marked absent, never punched, or on approved full-day
  // leave — the same people the Attendance Monitor's Absent list shows.
  const absentToday =
    attendance.filter((r) => r.status === 'absent').length +
    roster.notPunched.length +
    (roster.offDay ? 0 : roster.onLeave.length)
  const attendanceLink = (status: string) => `/admin/attendance?date=${today}&status=${status}`
  const overtimeToday = attendance.reduce((sum, r) => sum + (r.overtime_minutes ?? 0), 0)
  const missedPunchOuts = attendance.filter((r) => r.missed_punch_out).length
  const awaitingApprovals = tasks.filter((t) => t.status?.slug === 'awaiting_approval').length
  const reworkTasks = tasks.filter((t) => t.status?.slug === 'rework').length
  const overdueTasks = tasks.filter(
    (t) => !t.status?.is_terminal && getTaskDelay(t.due_date, null).state === 'overdue',
  ).length
  const pendingAppraisals = appraisals.filter((a) => a.overall_score == null).length
  const activeCandidates = useRecruitmentCount()
  const interviewsToday = useInterviewsTodayCount(today)
  const todayPrefix = today
  const visitorsToday = visitors.filter((v) => v.visit_date === today).length
  const meetingsToday = meetings.filter((m) => (m.starts_at || '').startsWith(todayPrefix)).length
  const assetsAssigned = assetAssignments ? assetAssignments.size : 0
  const activeTrainings = 0 // Placeholder, kept simple: real breakdown lives in Training module.
  const unackCount = useUnackedPolicyCount(policies.map((p) => p.id), (myAcks as Set<string> | undefined) ?? new Set<string>())
  const dateLabel = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  // Labels say "today" on today; "on <short date>" when the admin walked
  // the dashboard back — avoids the confusing "Present today" on a past day.
  const isToday = today === realToday
  const dateSuffix = isToday ? 'today' : `on ${new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
  const content: Record<string, ReactNode> = {
    employees: <Stat label="Employees" value={users.length} icon={Users} to="/admin/users" />,
    present: (
      <Stat
        label={`Present ${dateSuffix} (of ${roster.expected.length})`}
        value={presentToday}
        icon={CalendarCheck}
        tone="green"
        to={attendanceLink('present')}
      />
    ),
    late: (
      <Stat
        label={`Late arrivals ${dateSuffix}`}
        value={lateToday}
        icon={AlarmClock}
        tone="amber"
        to={attendanceLink('late')}
      />
    ),
    'leave-approvals': (
      <Stat
        label="Pending leave approvals"
        value={pendingLeaves.length}
        icon={Plane}
        tone="amber"
        to="/admin/leave"
      />
    ),
    'open-tasks': (
      <Stat label="Open tasks" value={openTasks} icon={ListChecks} tone="blue" to="/tasks" />
    ),
    'open-tickets': (
      <Stat
        label={
          breachedTickets > 0 ? `Open tickets (${breachedTickets} SLA breached)` : 'Open tickets'
        }
        value={openTickets}
        icon={LifeBuoy}
        tone={breachedTickets > 0 ? 'red' : 'blue'}
        to="/helpdesk"
      />
    ),
    'absent-today': (
      <Stat
        label={`Absent ${dateSuffix}${roster.offDay ? ` · ${roster.offDay}` : ''}`}
        value={roster.ready ? absentToday : '—'}
        icon={UserX}
        tone="red"
        to={attendanceLink('absent')}
      />
    ),
    'overtime-today': (
      <Stat label={`Overtime minutes (${dateSuffix})`} value={overtimeToday} icon={Clock} tone="blue" to={attendanceLink('overtime')} />
    ),
    'missed-punchouts': (
      <Stat label="Missed punch-outs" value={missedPunchOuts} icon={TriangleAlert} tone="amber" to={attendanceLink('missed')} />
    ),
    'awaiting-approvals': (
      <Stat label="Tasks awaiting approval" value={awaitingApprovals} icon={ClipboardList} tone="amber" to="/tasks" />
    ),
    'rework-tasks': (
      <Stat label="Tasks in rework" value={reworkTasks} icon={ClipboardList} tone="amber" to="/tasks" />
    ),
    'overdue-tasks': (
      <Stat label="Overdue tasks" value={overdueTasks} icon={CalendarRange} tone="red" to="/tasks" />
    ),
    'sla-breaches': (
      <Stat label="Helpdesk SLA breaches" value={breachedTickets} icon={TriangleAlert} tone="red" to="/helpdesk" />
    ),
    'candidates-pipeline': (
      <Stat label="Active candidates" value={activeCandidates} icon={Briefcase} tone="brand" to="/admin/recruitment" />
    ),
    'interviews-today': (
      <Stat label={`Interviews ${dateSuffix}`} value={interviewsToday} icon={UserCheck} tone="brand" to="/admin/recruitment" />
    ),
    'visitors-today': (
      <Stat label={`Visitors ${dateSuffix}`} value={visitorsToday} icon={IdCard} tone="brand" to="/admin/visitors" />
    ),
    'meetings-today': (
      <Stat label={`Meetings ${dateSuffix}`} value={meetingsToday} icon={CalendarRange} tone="brand" to="/admin/visitors" />
    ),
    'appraisals-pending': (
      <Stat label="Appraisals pending" value={pendingAppraisals} icon={Award} tone="amber" to="/admin/appraisal" />
    ),
    'trainings-progress': (
      <Stat label="Trainings in progress" value={activeTrainings} icon={GraduationCap} tone="blue" to="/admin/training" />
    ),
    'unack-policies': (
      <Stat label="Unacknowledged policies" value={unackCount} icon={BookText} tone="amber" to="/admin/policies" />
    ),
    'assets-assigned': (
      <Stat label="Assets assigned" value={assetsAssigned} icon={Package} tone="brand" to="/admin/assets" />
    ),

    departments: (
      <Stat label="Departments" value={departments.length} icon={Building2} to="/admin/hierarchy" />
    ),
    'leave-list': (
      <SectionCard
        title="Pending leave approvals"
        to="/admin/leave"
        linkLabel="Review"
        testid="dash-pending-leaves"
      >
        {pendingLeaves.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing awaiting approval.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendingLeaves.slice(0, 5).map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {l.requester?.full_name || l.requester?.email || 'Employee'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {l.leave_type?.name} · {l.start_date} → {l.end_date}
                  </p>
                </div>
              <div className="flex items-center gap-1">
                <Badge tone="amber">{l.days}d</Badge>
                <button
                  type="button"
                  aria-label={`Approve leave for ${l.requester?.full_name ?? 'employee'}`}
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                  onClick={() => setLeaveDecision({ request: l, decision: 'approved' })}
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Reject leave for ${l.requester?.full_name ?? 'employee'}`}
                  className="rounded p-1 text-red-600 hover:bg-red-50"
                  onClick={() => setLeaveDecision({ request: l, decision: 'rejected' })}
                >
                  <X className="size-4" />
                </button>
              </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    ),
    'employee-snapshot': (
      <EmployeeSnapshotCard users={users} attendance={attendance} tasks={tasks} today={today} />
    ),
    announcements: (
      <SectionCard
        title="Latest announcements"
        to="/announcements"
        linkLabel="Notice board"
        testid="dash-announcements"
      >
        {announcements.length === 0 ? (
          <p className="text-sm text-slate-400">No announcements posted.</p>
        ) : (
          <ul className="space-y-3">
            {announcements.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className="bg-brand-50 text-brand-600 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
                  <Megaphone className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{a.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    ),
  }

  return (
    <div data-testid="admin-dashboard">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Organisation overview · {dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500" htmlFor="dash-date">
            Date
          </label>
          <input
            id="dash-date"
            data-testid="dash-date-picker"
            type="date"
            value={selectedDate}
            max={realToday}
            onChange={(e) => setSelectedDate(e.target.value || realToday)}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
          />
          {selectedDate !== realToday && (
            <button
              type="button"
              data-testid="dash-date-reset"
              onClick={() => setSelectedDate(realToday)}
              className="text-xs text-brand-600 hover:underline"
            >
              Reset to today
            </button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
            <Settings2 className="size-4" /> Customize
          </Button>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {preferences.order
          .filter((id) => !preferences.hidden.includes(id))
          .map((id) => (
            <div
              key={id}
              className={
                WIDE_WIDGET_IDS.has(id) ? 'lg:col-span-2' : undefined
              }
            >
              {content[id]}
            </div>
          ))}
      </div>
      {customizing && (
        <DashboardCustomizer
          widgets={ADMIN_WIDGETS}
          value={preferences}
          saving={save.isPending}
          onClose={() => setCustomizing(false)}
          onSave={(value) =>
            save.mutate(value, {
              onSuccess: ({ synced, error }) => {
                if (synced) toast.success('Dashboard saved')
                else toast.info('Saved on this device', error)
                setCustomizing(false)
              },
            })
          }
        />
      )}
      {leaveDecision && (
        <LeaveDecisionModal
          request={leaveDecision.request}
          decision={leaveDecision.decision}
          onClose={() => setLeaveDecision(null)}
        />
      )}
    </div>
  )
}

/**
 * "Admin me employee ka dashboard bhi show ho" (meeting ask) — a single
 * section where admins pick any employee and see their core day: attendance,
 * tasks pipeline and leave balance. Keeps the full Employee view a click away
 * via the top-bar toggle.
 */
function EmployeeSnapshotCard({
  users,
  attendance,
  tasks,
  today,
}: {
  users: Array<{ id: string; full_name: string; email: string }>
  attendance: Array<{ user_id: string; status: string | null; is_late: boolean | null; first_in_at: string | null; last_out_at: string | null; worked_minutes: number | null }>
  tasks: Array<{ assignee_id: string | null; status: { slug: string; is_terminal: boolean } | null; due_date: string | null; progress_percent: number }>
  today: string
}) {
  const sortedUsers = [...users].sort((a, b) =>
    (a.full_name || a.email).localeCompare(b.full_name || b.email),
  )
  const [selected, setSelected] = useState(sortedUsers[0]?.id ?? '')
  const effective = selected || sortedUsers[0]?.id || ''
  const myAtt = attendance.find((a) => a.user_id === effective) ?? null
  const myTasks = tasks.filter((t) => t.assignee_id === effective)
  const openCount = myTasks.filter((t) => !t.status?.is_terminal).length
  const overdueCount = myTasks.filter(
    (t) =>
      !t.status?.is_terminal &&
      t.due_date != null &&
      t.due_date < today &&
      (t.progress_percent ?? 0) < 100,
  ).length
  const awaitingCount = myTasks.filter((t) => t.status?.slug === 'awaiting_approval').length
  const { data: balances = [] } = useEmployeeLeaveBalance(effective)
  const totalRemaining = balances.reduce((sum, b) => sum + Math.max(0, b.remaining), 0)
  const attStatus = myAtt?.status ?? 'not_punched'
  const attLabel =
    attStatus === 'full_day' ? 'Full day'
    : attStatus === 'half_day' ? 'Half day'
    : attStatus === 'quarter_day' ? 'Quarter day'
    : attStatus === 'present' ? 'Present'
    : attStatus === 'absent' ? 'Absent'
    : '—'

  return (
    <Card>
      <CardBody data-testid="employee-snapshot-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Employee's dashboard</h2>
          <select
            data-testid="employee-snapshot-picker"
            value={effective}
            onChange={(e) => setSelected(e.target.value)}
            className="max-w-56 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {sortedUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>
        {!effective ? (
          <p className="text-sm text-slate-400">No employees to display.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SnapshotTile label="Today" value={attLabel} tone={myAtt?.is_late ? 'amber' : 'brand'} />
            <SnapshotTile label="Open tasks" value={openCount} />
            <SnapshotTile label="Overdue" value={overdueCount} tone={overdueCount ? 'red' : 'brand'} />
            <SnapshotTile label="Awaiting approval" value={awaitingCount} tone="amber" />
            <SnapshotTile label="Leave remaining" value={totalRemaining} tone="green" />
            <SnapshotTile
              label="First in"
              value={myAtt?.first_in_at ? new Date(myAtt.first_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            />
            <SnapshotTile
              label="Last out"
              value={myAtt?.last_out_at ? new Date(myAtt.last_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            />
            <SnapshotTile
              label="Worked"
              value={myAtt?.worked_minutes != null ? `${Math.floor(myAtt.worked_minutes / 60)}h ${myAtt.worked_minutes % 60}m` : '—'}
            />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function SnapshotTile({
  label,
  value,
  tone = 'brand',
}: {
  label: string
  value: number | string
  tone?: 'brand' | 'green' | 'amber' | 'red'
}) {
  const toneCls: Record<string, string> = {
    brand: 'text-slate-900',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className={`text-lg font-semibold ${toneCls[tone]}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

function useEmployeeLeaveBalance(userId: string | null) {
  const year = new Date().getFullYear()
  return useQuery({
    queryKey: ['employee-leave-balance', userId, year],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_balances')
        .select('allocated, used')
        .eq('user_id', userId!)
        .eq('year', year)
      if (error) throw error
      return (data ?? []).map((row) => ({
        remaining: Number(row.allocated ?? 0) - Number(row.used ?? 0),
      }))
    },
  })
}
