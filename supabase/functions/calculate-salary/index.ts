// Edge Function: policy-driven monthly salary calculation.
// Server-side only — verifies the caller has `salary.manage`, gathers attendance,
// leave, planning-compliance and adjustment data with the service role, computes
// the payslip, and upserts a salary_run.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { computePayroll } from './calc.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // 1) Authorize the caller (RLS-aware client using their JWT).
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: allowed, error: permErr } = await caller.rpc('has_permission', {
      perm: 'salary.manage',
    })
    if (permErr) return json({ error: permErr.message }, 400)
    if (!allowed) return json({ error: 'forbidden: salary.manage required' }, 403)

    const { userId, month } = await req.json()
    if (!userId || !month) return json({ error: 'userId and month (YYYY-MM) required' }, 400)

    const periodStart = `${month}-01`
    const end = new Date(`${periodStart}T00:00:00Z`)
    end.setUTCMonth(end.getUTCMonth() + 1)
    const endStr = end.toISOString().slice(0, 10)

    // 2) Gather inputs with the service role (bypasses RLS deliberately).
    const admin = createClient(url, service)
    // Finalize days the employee never punched out of, so salary uses the same
    // hours-based status the attendance monitor and report show.
    await admin.rpc('close_stale_attendance', { p_user: userId })
    const [
      policyRes,
      profileRes,
      daysRes,
      leavesRes,
      complRes,
      adjRes,
      callerUser,
      holidaysRes,
      attCfgRes,
      personRes,
    ] = await Promise.all([
        admin.from('salary_policy').select('*').eq('id', true).single(),
        admin.from('salary_profiles').select('monthly_ctc').eq('user_id', userId).maybeSingle(),
        admin
          .from('attendance_days')
          .select('status,is_late,overtime_minutes,work_date')
          .eq('user_id', userId)
          .gte('work_date', periodStart)
          .lt('work_date', endStr),
        admin
          .from('leave_requests')
          .select('days,status,start_date,leave_types(is_paid)')
          .eq('user_id', userId)
          .eq('status', 'approved')
          .gte('start_date', periodStart)
          .lt('start_date', endStr),
        admin.rpc('planning_compliant_days', {
          p_user: userId,
          p_from: periodStart,
          p_to: endStr,
        }),
        admin
          .from('salary_adjustments')
          .select('kind,amount')
          .eq('user_id', userId)
          .eq('period_month', periodStart),
        caller.auth.getUser(),
        admin
          .from('holidays')
          .select('holiday_date,name')
          .gte('holiday_date', periodStart)
          .lt('holiday_date', endStr),
        admin.from('attendance_config').select('timezone').eq('id', true).maybeSingle(),
        admin.from('profiles').select('created_at').eq('id', userId).maybeSingle(),
      ])

    const policy = policyRes.data
    if (!policy) return json({ error: 'salary policy missing' }, 400)
    const monthlyCtc = Number(profileRes.data?.monthly_ctc ?? 0)
    const days = daysRes.data ?? []
    const leaves = leavesRes.data ?? []
    const compliantDays = (complRes.data ?? []) as string[]
    const adjustments = (adjRes.data ?? []) as Array<{ kind: string; amount: number }>

    const paidLeaveDays = leaves
      // deno-lint-ignore no-explicit-any
      .filter((l: any) => l.leave_types?.is_paid)
      .reduce((s: number, l: { days: number }) => s + Number(l.days), 0)

    const tz = attCfgRes.data?.timezone ?? 'Asia/Kolkata'
    const dateIn = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
    const createdAt = personRes.data?.created_at

    const calc = computePayroll({
      month,
      today: dateIn(new Date()),
      monthlyCtc,
      policy,
      days,
      paidLeaveDays,
      holidays: holidaysRes.data ?? [],
      compliantDates: compliantDays,
      adjustments,
      joinedOn: createdAt ? dateIn(new Date(createdAt)) : null,
    })

    const row = {
      user_id: userId,
      period_month: periodStart,
      present_days: calc.present,
      half_days: calc.half,
      quarter_days: calc.quarter,
      absent_days: calc.absent,
      paid_leave_days: paidLeaveDays,
      late_count: calc.lateCount,
      overtime_minutes: calc.overtimeMinutes,
      planning_noncompliant_days: calc.nonCompliant,
      base_earned: calc.baseEarned,
      overtime_pay: calc.overtimePay,
      incentives: calc.incentives,
      increments: calc.increments,
      penalties: calc.penalties,
      pf: calc.pf,
      esic: calc.esic,
      professional_tax: calc.professionalTax,
      tds: calc.tds,
      gross: calc.gross,
      net: calc.net,
      breakdown: calc.breakdown,
      status: 'finalized',
      computed_by: callerUser.data.user?.id ?? null,
      computed_at: new Date().toISOString(),
    }

    const { data: saved, error: saveErr } = await admin
      .from('salary_runs')
      .upsert(row, { onConflict: 'user_id,period_month' })
      .select()
      .single()
    if (saveErr) return json({ error: saveErr.message }, 400)

    return json({ ok: true, run: saved })
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500)
  }
})
