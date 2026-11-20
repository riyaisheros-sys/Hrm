import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ReportColumn } from './export'
import { statusLabel } from '@/features/attendance/status'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'
import { getTaskDelay } from '@/features/tasks/delay'
import {
  DEFAULT_LATE_GRACE_MINUTES,
  formatLateBy,
  planningLateMinutes,
} from '@/features/planning/late'
import { APPRAISAL_FORMULA, appraisalMarks, appraisalRating } from '@/features/appraisal/scoring'

export type ReportType =
  | 'attendance'
  | 'leave'
  | 'salary'
  | 'task'
  | 'appraisal'
  | 'planning'
  | 'planning_lock'
  | 'recruitment'
  | 'communication'
  | 'documents'
  | 'assets'
  | 'lifecycle'
  | 'helpdesk'
  | 'visitors'
  | 'meetings'
  | 'training'
  | 'policies'
  | 'workflows'

export interface ReportFilters {
  from?: string
  to?: string
  userId?: string
  status?: string
  category?: string
  priority?: string
  /** 'self' | 'assigned' — task report filter. */
  taskType?: string
  /** Case-insensitive title search — task report. */
  taskSearch?: string
  /** Task report: what From / To mean — the task's created date (default) or
   *  the date of a planning update linked to it. */
  dateField?: 'created' | 'planning'
}

export interface ReportData {
  title: string
  filename: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
}

export const REPORT_LABELS: Record<ReportType, string> = {
  attendance: 'Attendance',
  leave: 'Leave',
  salary: 'Salary',
  task: 'Task',
  appraisal: 'Performance / Appraisal',
  planning: 'Planning',
  planning_lock: 'Planning Lock / Unlock',
  recruitment: 'Recruitment',
  communication: 'Communication',
  documents: 'Doc Vault',
  assets: 'Assets',
  lifecycle: 'Lifecycle',
  helpdesk: 'Helpdesk',
  visitors: 'Visitors',
  meetings: 'Meetings',
  training: 'Training',
  policies: 'Policies',
  workflows: 'Workflows',
}

/**
 * The settings behind "late planning entry" (grace, office timezone, day end).
 * Read once per report; missing columns fall back to defaults so the reports
 * keep working on a database that has not had the setting added yet.
 */
async function loadLateRule() {
  const [planning, attendance] = await Promise.all([
    supabase.from('planning_config').select('*').maybeSingle(),
    supabase.from('attendance_config').select('timezone').maybeSingle(),
  ])
  const cfg = (planning.data ?? {}) as { late_entry_grace_minutes?: number; day_end?: string }
  return {
    graceMinutes: cfg.late_entry_grace_minutes ?? DEFAULT_LATE_GRACE_MINUTES,
    dayEnd: cfg.day_end ?? '18:30',
    timeZone: attendance.data?.timezone ?? 'Asia/Kolkata',
  }
}

type Person = { full_name: string | null; email: string } | null
const name = (p: Person) => p?.full_name || p?.email || '—'

interface AttRow {
  work_date: string
  status: string
  first_in_at: string | null
  last_out_at: string | null
  worked_minutes: number
  is_late: boolean
  late_minutes: number
  missed_punch_out: boolean
  is_manual: boolean
  remarks: string | null
  overtime_minutes: number
  profiles: Person
}

interface LeaveRow {
  user_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days: number
  status: string
  reason: string | null
  leave_type: { name: string } | null
  requester: Person
}
interface SalaryRow {
  period_month: string
  present_days: number
  gross: number
  net: number
  employee: Person
}
interface TaskRow {
  id: string
  title: string
  description: string | null
  priority: string
  due_date: string | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
  accepted_at: string | null
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  rework_reason: string | null
  progress_percent: number
  remarks: string | null
  task_type: string | null
  bulk_key: string | null
  status: { name: string; slug: string; is_terminal: boolean } | null
  category: { name: string } | null
  assignee: (Person & { employee_code?: string | null }) | null
  creator: (Person & { employee_code?: string | null }) | null
  approver: Person | null
  task_status_history: {
    remarks: string | null
    created_at: string
    changed_by: string | null
    to_status: { name: string } | null
    changer: { full_name: string | null; email: string } | null
  }[]
  planning_slots: {
    plan_date: string
    start_time: string | null
    end_time: string | null
    progress: number | null
    remarks: string | null
    challenges: string | null
    task_name: string | null
    created_at: string
  }[]
}
interface ApprRow {
  attendance_score: number
  task_score: number
  planning_score: number
  overall_score: number
  manager_feedback: string | null
  employee_feedback: string | null
  employee: Person
  cycle: { name: string } | null
}

const fetchers: Record<ReportType, (f: ReportFilters) => Promise<ReportData>> = {
  attendance: async (f) => {
    // Same finalization the monitor and salary run, so all three agree.
    await supabase.rpc('close_stale_attendance')
    let q = supabase
      .from('attendance_days')
      .select(
        'work_date,status,first_in_at,last_out_at,worked_minutes,is_late,late_minutes,missed_punch_out,is_manual,remarks,overtime_minutes, profiles(full_name,email)',
      )
    if (f.userId) q = q.eq('user_id', f.userId)
    if (f.from) q = q.gte('work_date', f.from)
    if (f.to) q = q.lte('work_date', f.to)
    // "Status" in the attendance report filters one of the real attendance
    // statuses OR the flag-style pseudo-statuses (late, overtime,
    // missed_punch_out, corrected). Previously ignored — always returned the
    // same rows for every choice.
    if (f.status) {
      switch (f.status) {
        case 'present':
          q = q.in('status', ['present', 'full_day'])
          break
        case 'full_day':
        case 'half_day':
        case 'quarter_day':
        case 'absent':
          q = q.eq('status', f.status)
          break
        case 'late':
          q = q.eq('is_late', true)
          break
        case 'overtime':
          q = q.gt('overtime_minutes', 0)
          break
        case 'missed_punch_out':
          q = q.eq('missed_punch_out', true)
          break
        case 'corrected':
          q = q.eq('is_manual', true)
          break
      }
    }
    const { data, error } = await q.order('work_date', { ascending: false }).limit(1000)
    if (error) throw error
    const list = (data ?? []) as unknown as AttRow[]
    return {
      title: 'Attendance Report',
      filename: 'attendance-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'date', label: 'Date' },
        { key: 'status', label: 'Status' },
        { key: 'punchIn', label: 'Punch In' },
        { key: 'punchOut', label: 'Punch Out' },
        { key: 'worked', label: 'Worked (min)' },
        { key: 'late', label: 'Late By (min)' },
        { key: 'overtime', label: 'Overtime (min)' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: list.map((d) => ({
        employee: name(d.profiles),
        date: formatDate(d.work_date),
        status: statusLabel(d.status),
        punchIn: formatTime(d.first_in_at),
        punchOut: formatTime(d.last_out_at),
        worked: d.worked_minutes,
        late: d.is_late ? d.late_minutes : 0,
        overtime: d.overtime_minutes,
        remarks: [
          d.missed_punch_out ? 'Missed punch-out' : '',
          d.is_manual ? `Corrected: ${d.remarks ?? ''}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        // Not columns — drive the row colours on screen and in the PDF.
        _status: d.status,
        _sunday: new Date(`${d.work_date}T00:00:00`).getDay() === 0,
      })),
    }
  },
  leave: async (f) => {
    let q = supabase
      .from('leave_requests')
      .select(
        'user_id,leave_type_id,start_date,end_date,days,status,reason, leave_type:leave_types(name), requester:profiles!leave_requests_user_id_fkey(full_name,email)',
      )
      .is('deleted_at', null)
    if (f.userId) q = q.eq('user_id', f.userId)
    if (f.from) q = q.gte('start_date', f.from)
    if (f.to) q = q.lte('start_date', f.to)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    const list = (data ?? []) as unknown as LeaveRow[]
    let balanceQuery = supabase
      .from('leave_balances')
      .select('user_id,leave_type_id,year,allocated,used')
    if (f.userId) balanceQuery = balanceQuery.eq('user_id', f.userId)
    const { data: balanceData, error: balanceError } = await balanceQuery
    if (balanceError) throw balanceError
    const balanceMap = new Map(
      (balanceData ?? []).map((balance) => [
        `${balance.user_id}:${balance.leave_type_id}:${balance.year}`,
        balance,
      ]),
    )
    return {
      title: 'Leave Report',
      filename: 'leave-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'type', label: 'Type' },
        { key: 'from', label: 'From' },
        { key: 'to', label: 'To' },
        { key: 'days', label: 'Days' },
        { key: 'status', label: 'Status' },
        { key: 'reason', label: 'Leave Reason' },
        { key: 'available', label: 'Available Balance' },
        { key: 'used', label: 'Used Balance' },
        { key: 'remaining', label: 'Remaining Balance' },
      ],
      rows: list.map((r) => {
        const year = Number(r.start_date.slice(0, 4))
        const balance = balanceMap.get(`${r.user_id}:${r.leave_type_id}:${year}`)
        const available = Number(balance?.allocated ?? 0)
        const used = Number(balance?.used ?? 0)
        return {
          employee: name(r.requester),
          type: r.leave_type?.name,
          from: formatDate(r.start_date),
          to: formatDate(r.end_date),
          days: r.days,
          status: r.status,
          reason: r.reason || '—',
          available,
          used,
          remaining: available - used,
        }
      }),
    }
  },
  salary: async (f) => {
    let q = supabase
      .from('salary_runs')
      .select(
        'period_month,present_days,gross,net, employee:profiles!salary_runs_user_id_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('user_id', f.userId)
    if (f.from) q = q.gte('period_month', f.from)
    if (f.to) q = q.lte('period_month', f.to)
    const { data, error } = await q.order('period_month', { ascending: false }).limit(1000)
    if (error) throw error
    const list = (data ?? []) as unknown as SalaryRow[]
    return {
      title: 'Salary Report',
      filename: 'salary-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'month', label: 'Month' },
        { key: 'present', label: 'Present Days' },
        { key: 'gross', label: 'Gross' },
        { key: 'net', label: 'Net' },
      ],
      rows: list.map((r) => ({
        employee: name(r.employee),
        month: String(r.period_month).slice(0, 7),
        present: r.present_days,
        gross: r.gross,
        net: r.net,
      })),
    }
  },
  task: async (f) => {
    // Planning updates are always limited to the selected dates. In "planning
    // update date" mode the dates also decide which tasks are listed: only
    // tasks with at least one planning update in the range (!inner).
    const byPlanning = f.dateField === 'planning' && !!(f.from || f.to)
    let q = supabase
      .from('tasks')
      .select(
        'id,title,description,priority,due_date,created_at,updated_at,completed_at,accepted_at,submitted_at,approved_at,rejected_at,rejection_reason,rework_reason,progress_percent,remarks,task_type,bulk_key,status:task_statuses(name,slug,is_terminal),category:task_categories(name),assignee:profiles!tasks_assignee_id_fkey(id,full_name,email,employee_code),creator:profiles!tasks_created_by_fkey(id,full_name,email,employee_code),approver:profiles!tasks_approved_by_fkey(full_name,email),task_status_history(remarks,created_at,changed_by,to_status:task_statuses!task_status_history_to_status_id_fkey(name),changer:profiles!task_status_history_changed_by_fkey(full_name,email)),planning_slots' +
          (byPlanning ? '!inner' : '') +
          '(plan_date,start_time,end_time,progress,remarks,challenges,task_name,created_at)',
      )
    if (f.userId) q = q.eq('assignee_id', f.userId)
    if (!byPlanning) {
      if (f.from) q = q.gte('created_at', f.from)
      if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`)
    }
    if (f.from) q = q.gte('planning_slots.plan_date', f.from)
    if (f.to) q = q.lte('planning_slots.plan_date', f.to)
    if (f.category) q = q.eq('category_id', f.category)
    if (f.priority) q = q.eq('priority', f.priority)
    if (f.taskType) q = q.eq('task_type', f.taskType)
    if (f.taskSearch) q = q.ilike('title', `%${f.taskSearch}%`)
    // Status filter targets the task_statuses.slug via FK join.
    if (f.status) {
      const { data: s } = await supabase
        .from('task_statuses')
        .select('id')
        .eq('slug', f.status)
        .maybeSingle()
      if (s?.id) q = q.eq('status_id', s.id)
    }
    const [{ data, error }, rule] = await Promise.all([
      q.order('created_at', { ascending: false }).limit(1000),
      loadLateRule(),
    ])
    if (error) throw error
    const list = (data ?? []) as unknown as TaskRow[]
    const lateOf = (slot: TaskRow['planning_slots'][number]) =>
      planningLateMinutes({
        planDate: slot.plan_date,
        endTime: slot.end_time,
        createdAt: slot.created_at,
        ...rule,
      })
    return {
      title: 'Task Report',
      filename: 'task-report',
      // Every field the task row carries is exposed; admin can hide/reorder
      // in Window 2. "Show every detail" per client request (19 Nov).
      columns: [
        { key: 'id', label: 'Task ID' },
        { key: 'taskGroup', label: 'Task Group' },
        { key: 'title', label: 'Task' },
        { key: 'description', label: 'Description' },
        { key: 'assignee', label: 'Assignee' },
        { key: 'assigneeEmail', label: 'Assignee Email' },
        { key: 'assigneeCode', label: 'Assignee Code' },
        { key: 'assignor', label: 'Assigned By' },
        { key: 'assignorEmail', label: 'Assignor Email' },
        { key: 'status', label: 'Status' },
        { key: 'statusSlug', label: 'Status Slug' },
        { key: 'priority', label: 'Priority' },
        { key: 'progress', label: 'Completion %' },
        { key: 'taskType', label: 'Task Type' },
        { key: 'bulkKey', label: 'Bulk Key' },
        { key: 'created', label: 'Created Date' },
        { key: 'updated', label: 'Last Updated' },
        { key: 'due', label: 'Due Date' },
        { key: 'accepted', label: 'Accepted At' },
        { key: 'submitted', label: 'Submitted At' },
        { key: 'approved', label: 'Approved At' },
        { key: 'approver', label: 'Approved By' },
        { key: 'rejected', label: 'Rejected At' },
        { key: 'rejectionReason', label: 'Rejection Reason' },
        { key: 'reworkReason', label: 'Rework Reason' },
        { key: 'completed', label: 'Actual Completion Date' },
        { key: 'delayStatus', label: 'Delay Status' },
        { key: 'delayDays', label: 'Delay Days' },
        { key: 'delayComments', label: 'Delay Comments' },
        { key: 'remarks', label: 'Remarks' },
        { key: 'planningUpdates', label: 'Planning Updates' },
        { key: 'planningCount', label: 'Planning Slots' },
        { key: 'planningLate', label: 'Late Planning Entries' },
        { key: 'history', label: 'History' },
        { key: 'historyCount', label: 'History Entries' },
      ],
      rows: list.map((t) => {
        const delay = getTaskDelay(t.due_date, t.completed_at)
        const history = t.task_status_history ?? []
        const historyChronological = [...history].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        )
        // Human-readable single-string of every status change — what the
        // client meant by "show the content of the history, what work is
        // done, what is history update". Each entry: "Status · 2 Nov by
        // Riya · 'remark'". Joined with newlines so the table cell can
        // render them one per line.
        const historySummary = historyChronological
          .map((h) => {
            const status = h.to_status?.name ?? 'Updated'
            const when = formatDate(h.created_at)
            const who = h.changer?.full_name || h.changer?.email || 'System'
            const note = h.remarks?.trim()
            return note
              ? `${status} · ${when} by ${who} — ${note}`
              : `${status} · ${when} by ${who}`
          })
          .join('\n')
        // Planning updates that reference this task (planning_slots.task_id).
        // Chronological; one line per slot: "<date> [<slot window>] · <progress>%
        // — <remarks or challenges>". So the admin sees everything the assignee
        // wrote in Planning for this task, straight from the report.
        const planningSlots = [...(t.planning_slots ?? [])].sort((a, b) => {
          const d = a.plan_date.localeCompare(b.plan_date)
          if (d !== 0) return d
          return (a.start_time ?? '').localeCompare(b.start_time ?? '')
        })
        const planningUpdates = planningSlots
          .map((s) => {
            const date = formatDate(s.plan_date)
            const win =
              s.start_time && s.end_time
                ? ` [${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}]`
                : ''
            const pct = typeof s.progress === 'number' ? ` · ${s.progress}%` : ''
            const notes = [s.remarks?.trim(), s.challenges?.trim()]
              .filter((x): x is string => !!x)
              .join(' · ')
            const task = s.task_name?.trim() && s.task_name.trim() !== t.title ? ` — ${s.task_name.trim()}` : ''
            const late = lateOf(s)
            const flag = late > 0 ? ` [LATE entry by ${formatLateBy(late)}]` : ''
            return `${date}${win}${pct}${flag}${task}${notes ? ` — ${notes}` : ''}`
          })
          .join('\n')
        const statusRemark = [...history]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .find((entry) => entry.remarks?.trim())?.remarks
        return {
          id: t.id,
          taskGroup: t.category?.name ?? '—',
          title: t.title,
          description: t.description ?? '—',
          assignee: name(t.assignee),
          assigneeEmail: t.assignee?.email ?? '—',
          assigneeCode: t.assignee?.employee_code ?? '—',
          assignor: name(t.creator),
          assignorEmail: t.creator?.email ?? '—',
          status: t.status?.name,
          statusSlug: t.status?.slug ?? '—',
          priority: t.priority,
          progress: t.progress_percent,
          taskType: t.task_type ?? '—',
          bulkKey: t.bulk_key ?? '—',
          created: formatDate(t.created_at),
          updated: formatDate(t.updated_at),
          due: formatDate(t.due_date),
          accepted: formatDate(t.accepted_at),
          submitted: formatDate(t.submitted_at),
          approved: formatDate(t.approved_at),
          approver: name(t.approver),
          rejected: formatDate(t.rejected_at),
          rejectionReason: t.rejection_reason ?? '—',
          reworkReason: t.rework_reason ?? '—',
          completed: formatDate(t.completed_at),
          delayStatus: delay.label,
          delayDays: delay.isDelayed ? delay.days : 0,
          delayComments: delay.isDelayed ? statusRemark || t.remarks || '—' : '—',
          remarks: t.remarks ?? '—',
          planningUpdates: planningUpdates || '—',
          // Structured copies for the on-screen detail view (not exported).
          _planning: planningSlots.map((slot) => ({
            date: slot.plan_date,
            from: slot.start_time ? String(slot.start_time).slice(0, 5) : '',
            to: slot.end_time ? String(slot.end_time).slice(0, 5) : '',
            progress: slot.progress,
            planned: slot.task_name?.trim() || '',
            working: slot.remarks?.trim() || '',
            challenges: slot.challenges?.trim() || '',
            enteredAt: slot.created_at,
            lateMinutes: lateOf(slot),
          })),
          _history: historyChronological.map((h) => ({
            at: h.created_at,
            status: h.to_status?.name ?? 'Updated',
            by: h.changer?.full_name || h.changer?.email || 'System',
            remarks: h.remarks?.trim() || '',
          })),
          planningCount: planningSlots.length,
          planningLate: planningSlots.filter((slot) => lateOf(slot) > 0).length,
          history: historySummary || '—',
          historyCount: history.length,
        }
      }),
    }
  },
  appraisal: async (f) => {
    let q = supabase
      .from('appraisals')
      .select(
        'attendance_score,task_score,planning_score,overall_score,manager_feedback,employee_feedback, employee:profiles!appraisals_user_id_fkey(full_name,email), cycle:appraisal_cycles(name)',
      )
    if (f.userId) q = q.eq('user_id', f.userId)
    if (f.from) q = q.gte('created_at', f.from)
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    const list = (data ?? []) as unknown as ApprRow[]
    return {
      title: 'Performance / Appraisal Report',
      filename: 'appraisal-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'cycle', label: 'Cycle' },
        { key: 'attendance', label: 'Attendance' },
        { key: 'task', label: 'Task' },
        { key: 'planning', label: 'Planning' },
        { key: 'overall', label: 'Overall' },
        { key: 'weightage', label: 'Formula / Weightage' },
        { key: 'totalMarks', label: 'Total Marks' },
        { key: 'obtainedMarks', label: 'Obtained Marks' },
        { key: 'finalRating', label: 'Final Rating' },
        { key: 'managerRemarks', label: 'Manager Remarks' },
        { key: 'employeeRemarks', label: 'Employee Remarks' },
      ],
      rows: list.map((a) => {
        const marks = appraisalMarks(a.attendance_score, a.task_score, a.planning_score)
        const rating = appraisalRating(a.overall_score)
        return {
          employee: name(a.employee),
          cycle: a.cycle?.name,
          attendance: a.attendance_score,
          task: a.task_score,
          planning: a.planning_score,
          overall: a.overall_score,
          weightage: APPRAISAL_FORMULA,
          totalMarks: marks.total,
          obtainedMarks: marks.obtained,
          finalRating: `${rating.code} · ${rating.label}`,
          managerRemarks: a.manager_feedback || '—',
          employeeRemarks: a.employee_feedback || '—',
        }
      }),
    }
  },
  planning: async (f) => {
    let q = supabase
      .from('planning_slots')
      .select(
        'plan_date,slot_label,start_time,end_time,task_name,progress,challenges,remarks,created_at,updated_at, profiles(full_name,email)',
      )
    if (f.userId) q = q.eq('user_id', f.userId)
    if (f.from) q = q.gte('plan_date', f.from)
    if (f.to) q = q.lte('plan_date', f.to)
    const [{ data, error }, rule] = await Promise.all([
      q.order('plan_date', { ascending: false }).limit(1000),
      loadLateRule(),
    ])
    if (error) throw error
    type Row = {
      plan_date: string
      slot_label: string
      start_time: string | null
      end_time: string | null
      task_name: string
      progress: number
      challenges: string | null
      remarks: string | null
      created_at: string
      updated_at: string
      profiles: Person
    }
    const list = ((data ?? []) as unknown as Row[])
      .map((r) => ({
        r,
        late: planningLateMinutes({
          planDate: r.plan_date,
          endTime: r.end_time,
          createdAt: r.created_at,
          ...rule,
        }),
      }))
      // Entry timing filter: 'late' | 'on_time'.
      .filter(({ late }) =>
        f.status === 'late' ? late > 0 : f.status === 'on_time' ? late === 0 : true,
      )
    return {
      title: 'Planning Report',
      filename: 'planning-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'date', label: 'Date' },
        { key: 'slot', label: 'Slot' },
        { key: 'task', label: 'Task' },
        { key: 'progress', label: 'Progress %' },
        { key: 'challenges', label: 'Challenges' },
        { key: 'remarks', label: 'Remarks' },
        { key: 'submitted', label: 'Submitted Time' },
        { key: 'entry', label: 'Entry Timing' },
        { key: 'updated', label: 'Last Updated Time' },
      ],
      rows: list.map(({ r, late }) => ({
        employee: name(r.profiles),
        date: formatDate(r.plan_date),
        slot:
          r.start_time && r.end_time
            ? `${String(r.start_time).slice(0, 5)}-${String(r.end_time).slice(0, 5)}`
            : r.slot_label,
        task: r.task_name,
        progress: r.progress,
        challenges: r.challenges ?? '',
        remarks: r.remarks ?? '',
        submitted: formatDateTime(r.created_at),
        entry: late > 0 ? `LATE by ${formatLateBy(late)}` : 'On time',
        updated: formatDateTime(r.updated_at),
        // Not a column — drives the red highlight on screen and in the PDF.
        _late: late > 0,
      })),
    }
  },
  recruitment: async (f) => {
    let q = supabase
      .from('candidates')
      .select(
        'full_name,email,phone,status,offer_status,created_at, opening:job_openings(title,designation), interviews(scheduled_at,interview_round)',
      )
    if (f.from) q = q.gte('created_at', f.from)
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      full_name: string
      email: string
      phone: string | null
      status: string
      offer_status: string
      created_at: string
      opening: { title: string; designation: string } | null
      interviews: { scheduled_at: string; interview_round: string | null }[]
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Recruitment Report',
      filename: 'recruitment-report',
      columns: [
        { key: 'candidate', label: 'Candidate' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'opening', label: 'Opening' },
        { key: 'status', label: 'Status' },
        { key: 'interviewDate', label: 'Interview Date' },
        { key: 'interviewRound', label: 'Interview Round' },
        { key: 'offer', label: 'Offer' },
      ],
      rows: list.map((c) => {
        const latestInterview = [...c.interviews].sort((a, b) =>
          b.scheduled_at.localeCompare(a.scheduled_at),
        )[0]
        return {
          candidate: c.full_name,
          email: c.email,
          phone: c.phone ?? '',
          opening: c.opening ? `${c.opening.designation}` : '—',
          status: c.status.charAt(0).toUpperCase() + c.status.slice(1),
          interviewDate: formatDateTime(latestInterview?.scheduled_at),
          interviewRound: latestInterview?.interview_round || '—',
          offer: c.offer_status,
        }
      }),
    }
  },
  communication: async (f) => {
    let q = supabase
      .from('document_file_activity')
      .select(
        'file_title,doc_type,action,occurred_at, employee:profiles!document_file_activity_employee_id_fkey(full_name,email), actor:profiles!document_file_activity_actor_id_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('employee_id', f.userId)
    if (f.from) q = q.gte('occurred_at', f.from)
    if (f.to) q = q.lte('occurred_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('occurred_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      file_title: string
      doc_type: string
      action: string
      occurred_at: string
      employee: Person
      actor: Person
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Communication Files Report',
      filename: 'communication-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'file', label: 'File' },
        { key: 'type', label: 'Document Type' },
        { key: 'action', label: 'Activity' },
        { key: 'actor', label: 'Uploaded / Downloaded By' },
        { key: 'date', label: 'Activity Date & Time' },
      ],
      rows: list.map((activity) => ({
        employee: name(activity.employee),
        file: activity.file_title,
        type: activity.doc_type,
        action: activity.action,
        actor: name(activity.actor),
        date: formatDateTime(activity.occurred_at),
      })),
    }
  },
  documents: async (f) => {
    let q = supabase
      .from('employee_documents')
      .select(
        'doc_type,title,version,created_at, employee:profiles!employee_documents_employee_id_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('employee_id', f.userId)
    if (f.from) q = q.gte('created_at', f.from)
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      doc_type: string
      title: string
      version: number
      created_at: string
      employee: Person
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Doc Vault Report',
      filename: 'doc-vault-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'type', label: 'Type' },
        { key: 'title', label: 'Title' },
        { key: 'version', label: 'Version' },
        { key: 'uploaded', label: 'Uploaded' },
      ],
      rows: list.map((d) => ({
        employee: name(d.employee),
        type: d.doc_type,
        title: d.title,
        version: d.version,
        uploaded: formatDateTime(d.created_at),
      })),
    }
  },
  assets: async (f) => {
    let q = supabase
      .from('asset_assignments')
      .select(
        'assigned_at,returned_at,note, asset:assets(name,asset_type,serial,status), assignee:profiles!asset_assignments_assignee_id_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('assignee_id', f.userId)
    if (f.from) q = q.gte('assigned_at', f.from)
    if (f.to) q = q.lte('assigned_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('assigned_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      assigned_at: string
      returned_at: string | null
      note: string | null
      asset: { name: string; asset_type: string; serial: string | null; status: string } | null
      assignee: Person
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Asset Allotment Report',
      filename: 'assets-report',
      columns: [
        { key: 'asset', label: 'Asset' },
        { key: 'type', label: 'Type' },
        { key: 'serial', label: 'Serial' },
        { key: 'assignee', label: 'Assignee' },
        { key: 'assigned', label: 'Assigned' },
        { key: 'returned', label: 'Returned' },
      ],
      rows: list.map((a) => ({
        asset: a.asset?.name ?? '—',
        type: a.asset?.asset_type ?? '—',
        serial: a.asset?.serial ?? '',
        assignee: name(a.assignee),
        assigned: formatDateTime(a.assigned_at),
        returned: formatDateTime(a.returned_at) || '—',
      })),
    }
  },
  lifecycle: async (f) => {
    let q = supabase
      .from('lifecycle_events')
      .select(
        'event_type,event_date,note, employee:profiles!lifecycle_events_employee_id_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('employee_id', f.userId)
    if (f.from) q = q.gte('event_date', f.from)
    if (f.to) q = q.lte('event_date', f.to)
    const { data, error } = await q.order('event_date', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = { event_type: string; event_date: string; note: string | null; employee: Person }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Lifecycle Report',
      filename: 'lifecycle-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'event', label: 'Event' },
        { key: 'date', label: 'Date' },
        { key: 'note', label: 'Note' },
      ],
      rows: list.map((e) => ({
        employee: name(e.employee),
        event: e.event_type,
        date: formatDate(e.event_date),
        note: e.note ?? '',
      })),
    }
  },
  helpdesk: async (f) => {
    let q = supabase
      .from('tickets')
      .select(
        'subject,description,category,priority,status,escalated,created_at,closed_at, raiser:profiles!tickets_raised_by_fkey(full_name,email), assignee:profiles!tickets_assigned_to_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('raised_by', f.userId)
    if (f.from) q = q.gte('created_at', f.from)
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`)
    if (f.status) q = q.eq('status', f.status)
    if (f.category) q = q.eq('category', f.category)
    if (f.priority) q = q.eq('priority', f.priority)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      subject: string
      description: string | null
      category: string
      priority: string
      status: string
      escalated: boolean
      created_at: string
      closed_at: string | null
      raiser: Person
      assignee: Person
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Helpdesk Report',
      filename: 'helpdesk-report',
      columns: [
        { key: 'subject', label: 'Subject' },
        { key: 'description', label: 'Description / Summary' },
        { key: 'raiser', label: 'Raised by' },
        { key: 'category', label: 'Category' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'assignedTo', label: 'Assigned To / Support Executive' },
        { key: 'created', label: 'Created Date' },
        { key: 'closed', label: 'Closed Date' },
        { key: 'escalated', label: 'Escalated' },
      ],
      rows: list.map((t) => ({
        subject: t.subject,
        description: t.description || '—',
        raiser: name(t.raiser),
        category: t.category,
        priority: t.priority,
        status: t.status,
        assignedTo: name(t.assignee),
        created: formatDateTime(t.created_at),
        closed: formatDateTime(t.closed_at),
        escalated: t.escalated ? 'Yes' : 'No',
      })),
    }
  },
  visitors: async (f) => {
    let q = supabase
      .from('visitors')
      .select(
        'name,company,purpose,visit_date,checked_in_at,checked_out_at, host:profiles!visitors_host_id_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('host_id', f.userId)
    if (f.from) q = q.gte('visit_date', f.from)
    if (f.to) q = q.lte('visit_date', f.to)
    const { data, error } = await q.order('visit_date', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      name: string
      company: string | null
      purpose: string | null
      visit_date: string
      checked_in_at: string | null
      checked_out_at: string | null
      host: Person
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Visitors Report',
      filename: 'visitors-report',
      columns: [
        { key: 'visitor', label: 'Visitor' },
        { key: 'company', label: 'Company' },
        { key: 'host', label: 'Host' },
        { key: 'purpose', label: 'Purpose of Visit' },
        { key: 'date', label: 'Date' },
        { key: 'checkin', label: 'Checked in' },
        { key: 'checkout', label: 'Checked out' },
      ],
      rows: list.map((v) => ({
        visitor: v.name,
        company: v.company ?? '',
        host: name(v.host),
        purpose: v.purpose || '—',
        date: formatDate(v.visit_date),
        checkin: formatDateTime(v.checked_in_at) || '—',
        checkout: formatDateTime(v.checked_out_at) || '—',
      })),
    }
  },
  meetings: async (f) => {
    let q = supabase
      .from('meetings')
      .select(
        'title,starts_at,ends_at,meeting_link, host:profiles!meetings_host_id_fkey(full_name,email), meeting_invitees(status)',
      )
    if (f.userId) q = q.eq('host_id', f.userId)
    if (f.from) q = q.gte('starts_at', f.from)
    if (f.to) q = q.lte('starts_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('starts_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      title: string
      starts_at: string
      ends_at: string | null
      meeting_link: string | null
      host: Person
      meeting_invitees: { status: string }[]
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Meetings Report',
      filename: 'meetings-report',
      columns: [
        { key: 'title', label: 'Meeting' },
        { key: 'host', label: 'Host' },
        { key: 'starts', label: 'Starts' },
        { key: 'ends', label: 'Ends' },
        { key: 'duration', label: 'Duration' },
        { key: 'invitees', label: 'Invited' },
        { key: 'accepted', label: 'Accepted' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'attended', label: 'Attended' },
      ],
      rows: list.map((m) => {
        const durationMinutes = m.ends_at
          ? Math.max(
              0,
              Math.round((new Date(m.ends_at).getTime() - new Date(m.starts_at).getTime()) / 60000),
            )
          : null
        return {
          title: m.title,
          host: name(m.host),
          starts: formatDateTime(m.starts_at),
          ends: formatDateTime(m.ends_at),
          duration: durationMinutes == null ? '—' : `${durationMinutes} min`,
          invitees: m.meeting_invitees.length,
          accepted: m.meeting_invitees.filter((i) => i.status === 'accepted').length,
          rejected: m.meeting_invitees.filter((i) => i.status === 'rejected').length,
          attended: m.meeting_invitees.filter((i) => i.status === 'attended').length,
        }
      }),
    }
  },
  training: async (f) => {
    let q = supabase
      .from('training_assignments')
      .select(
        'status,assigned_at,completed_at,acknowledged_at,certificate_issued,assessment_score,assessment_result, module:training_modules(title), assignee:profiles!training_assignments_user_id_fkey(full_name,email)',
      )
    if (f.userId) q = q.eq('user_id', f.userId)
    if (f.from) q = q.gte('assigned_at', f.from)
    if (f.to) q = q.lte('assigned_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('assigned_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      status: string
      assigned_at: string
      completed_at: string | null
      acknowledged_at: string | null
      certificate_issued: boolean
      assessment_score: number | null
      assessment_result: string | null
      module: { title: string } | null
      assignee: Person
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Training Report',
      filename: 'training-report',
      columns: [
        { key: 'module', label: 'Module' },
        { key: 'assignee', label: 'Assignee' },
        { key: 'status', label: 'Status' },
        { key: 'assigned', label: 'Assigned' },
        { key: 'completed', label: 'Completed' },
        { key: 'acknowledged', label: 'Acknowledged' },
        { key: 'certificate', label: 'Certificate Status' },
        { key: 'score', label: 'Training Score' },
        { key: 'result', label: 'Assessment Result' },
      ],
      rows: list.map((t) => ({
        module: t.module?.title ?? '—',
        assignee: name(t.assignee),
        status: t.status,
        assigned: formatDateTime(t.assigned_at),
        completed: formatDateTime(t.completed_at) || '—',
        acknowledged: formatDateTime(t.acknowledged_at) || '—',
        certificate: t.certificate_issued ? 'Issued' : 'Not Issued',
        score: t.assessment_score ?? '—',
        result: t.assessment_result || '—',
      })),
    }
  },
  policies: async (f) => {
    let q = supabase
      .from('policies')
      .select(
        'id,title,category,current_version,is_active,created_at,policy_versions(id,version,policy_acknowledgements(user_id,acknowledged_at))',
      )
    if (f.from) q = q.gte('created_at', f.from)
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      title: string
      id: string
      category: string
      current_version: number
      is_active: boolean
      created_at: string
      policy_versions: {
        id: string
        version: number
        policy_acknowledgements: { user_id: string; acknowledged_at: string }[]
      }[]
    }
    const list = (data ?? []) as unknown as Row[]
    let profileQuery = supabase.from('profiles').select('id,full_name,email').order('full_name')
    if (f.userId) profileQuery = profileQuery.eq('id', f.userId)
    const { data: profiles, error: profileError } = await profileQuery.limit(1000)
    if (profileError) throw profileError
    return {
      title: 'Policies Report',
      filename: 'policies-report',
      columns: [
        { key: 'title', label: 'Policy' },
        { key: 'employee', label: 'Employee' },
        { key: 'category', label: 'Category' },
        { key: 'version', label: 'Version' },
        { key: 'active', label: 'Active' },
        { key: 'created', label: 'Created' },
        { key: 'acknowledgement', label: 'Acknowledgement Status' },
        { key: 'acknowledgedAt', label: 'Acknowledged At' },
      ],
      rows: list.flatMap((policy) => {
        const current = policy.policy_versions.find(
          (version) => version.version === policy.current_version,
        )
        return (profiles ?? []).map((profile) => {
          const acknowledgement = current?.policy_acknowledgements.find(
            (item) => item.user_id === profile.id,
          )
          return {
            title: policy.title,
            employee: profile.full_name || profile.email,
            category: policy.category,
            version: policy.current_version,
            active: policy.is_active ? 'Yes' : 'No',
            created: formatDate(policy.created_at),
            acknowledgement: acknowledgement ? 'Acknowledged' : 'Pending',
            acknowledgedAt: formatDateTime(acknowledgement?.acknowledged_at),
          }
        })
      }),
    }
  },
  // Who is punch-locked right now (planning incomplete) + every admin unlock
  // with its remark. Status filter: 'locked' | 'unlocked'. The date range
  // applies to the planning date (the day whose planning was incomplete).
  planning_lock: async (f) => {
    const { data: people, error: pErr } = await supabase
      .from('profiles')
      .select('id,full_name,email,employee_code')
    if (pErr) throw pErr
    const byId = new Map((people ?? []).map((p) => [p.id, p]))
    const who = (id: string | null) => {
      const p = id ? byId.get(id) : null
      return p ? p.full_name || p.email : '—'
    }
    const inRange = (date: string | null | undefined) =>
      !date || ((!f.from || date >= f.from) && (!f.to || date <= f.to))

    const rows: Record<string, unknown>[] = []

    if (f.status !== 'unlocked') {
      // Needs attendance.unlock / planning.view_all; without it the caller
      // simply sees no live-lock rows (same as RLS on the history table).
      const { data: overview, error: oErr } = await supabase.rpc('punch_lock_overview')
      const live = oErr
        ? []
        : ((overview ?? []) as { user_id: string; locked: boolean; prev_date?: string }[])
      for (const entry of live) {
        if (!entry.locked) continue
        if (f.userId && entry.user_id !== f.userId) continue
        if (!inRange(entry.prev_date)) continue
        rows.push({
          employee: who(entry.user_id),
          code: byId.get(entry.user_id)?.employee_code ?? '—',
          state: 'Locked',
          planningDate: formatDate(entry.prev_date ?? null),
          unlockedBy: '—',
          unlockedAt: '—',
          remarks: 'Punch-in blocked — planning incomplete, waiting for admin unlock',
          _state: 'locked',
        })
      }
    }

    if (f.status !== 'locked') {
      let q = supabase
        .from('planning_unlock_history')
        .select('user_id,work_date,unlocked_by,remarks,created_at')
      if (f.userId) q = q.eq('user_id', f.userId)
      if (f.from) q = q.gte('work_date', f.from)
      if (f.to) q = q.lte('work_date', f.to)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
      if (error) throw error
      for (const h of data ?? []) {
        rows.push({
          employee: who(h.user_id),
          code: byId.get(h.user_id)?.employee_code ?? '—',
          state: 'Unlocked',
          planningDate: formatDate(h.work_date),
          unlockedBy: who(h.unlocked_by),
          unlockedAt: formatDateTime(h.created_at),
          remarks: h.remarks || '—',
          _state: 'unlocked',
        })
      }
    }

    return {
      title: 'Planning Lock / Unlock Report',
      filename: 'planning-lock-report',
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'code', label: 'Employee Code' },
        { key: 'state', label: 'State' },
        { key: 'planningDate', label: 'Planning Date (incomplete day)' },
        { key: 'unlockedBy', label: 'Unlocked By' },
        { key: 'unlockedAt', label: 'Unlocked At' },
        { key: 'remarks', label: 'Admin Remarks' },
      ],
      rows,
    }
  },
  workflows: async (f) => {
    let q = supabase
      .from('workflow_definitions')
      .select(
        'name,description,entity_type,is_active,created_at, owner:profiles!workflow_definitions_owner_id_fkey(full_name,email), workflow_steps(step_order)',
      )
    if (f.userId) q = q.eq('owner_id', f.userId)
    if (f.from) q = q.gte('created_at', f.from)
    if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    type Row = {
      name: string
      description: string | null
      entity_type: string
      is_active: boolean
      created_at: string
      owner: Person
      workflow_steps: { step_order: number }[]
    }
    const list = (data ?? []) as unknown as Row[]
    return {
      title: 'Workflows (Rulebook) Report',
      filename: 'workflows-report',
      columns: [
        { key: 'name', label: 'Workflow' },
        { key: 'description', label: 'Description' },
        { key: 'owner', label: 'Owner' },
        { key: 'entity', label: 'Applies to' },
        { key: 'steps', label: 'Steps' },
        { key: 'active', label: 'Active' },
        { key: 'created', label: 'Created' },
      ],
      rows: list.map((w) => ({
        name: w.name,
        description: w.description || '—',
        owner: name(w.owner),
        entity: w.entity_type,
        steps: w.workflow_steps.length,
        active: w.is_active ? 'Yes' : 'No',
        created: formatDateTime(w.created_at),
      })),
    }
  },
}

export function useReport(type: ReportType, filters: ReportFilters = {}) {
  return useQuery({
    queryKey: [
      'report',
      type,
      filters.from ?? '',
      filters.to ?? '',
      filters.userId ?? '',
      filters.status ?? '',
      filters.category ?? '',
      filters.priority ?? '',
      filters.taskType ?? '',
      filters.taskSearch ?? '',
      filters.dateField ?? '',
    ],
    queryFn: async () => {
      const report = await fetchers[type](filters)
      return {
        ...report,
        columns: [{ key: '_serial', label: 'Sr. No.' }, ...report.columns],
        rows: report.rows.map(
          (row, index) => ({ _serial: index + 1, ...row }) as Record<string, unknown>,
        ),
      }
    },
  })
}

export function useAllowedReportFields(type: ReportType) {
  return useQuery({
    queryKey: ['allowed-report-fields', type],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_allowed_fields', { p_module: type })
      if (error) throw error
      return new Map((data ?? []).map((item) => [item.field_key, item.is_visible]))
    },
  })
}
