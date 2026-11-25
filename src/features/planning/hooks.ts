import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Tables } from '@/types/database.types'

export type PlanningConfig = Tables<'planning_config'>
export type PlanningSlot = Tables<'planning_slots'>
export type PlanningCompliance = Tables<'planning_compliance'>

export function usePlanningConfig() {
  return useQuery({
    queryKey: ['planning-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('planning_config').select('*').single()
      if (error) throw error
      return data
    },
  })
}

/** Change planning settings (needs planning.config). */
export function useUpdatePlanningConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<PlanningConfig>) => {
      const { data, error } = await supabase
        .from('planning_config')
        .update(patch)
        .eq('id', true)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to change planning settings')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-config'] })
      qc.invalidateQueries({ queryKey: ['report'] })
    },
  })
}

export function usePlanningSlots(planDate: string, kind: 'day' | 'next_day') {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['planning-slots', user?.id, planDate, kind],
    enabled: !!user && !!planDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planning_slots')
        .select('*')
        .eq('user_id', user!.id)
        .eq('plan_date', planDate)
        .eq('kind', kind)
        .order('slot_index')
      if (error) throw error
      return data
    },
  })
}

export function useUpsertSlot() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (s: {
      planDate: string
      kind: 'day' | 'next_day'
      slotIndex: number
      slotLabel: string
      taskName: string
      taskId?: string | null
      /** Every task worked on in this slot (first one is also `taskId`). */
      taskIds?: string[]
      progress: number
      challenges?: string
      remarks?: string
      startTime?: string | null
      endTime?: string | null
    }) => {
      const taskIds = [...new Set((s.taskIds ?? (s.taskId ? [s.taskId] : [])).filter(Boolean))]
      const { data: saved, error } = await supabase.from('planning_slots').upsert(
        {
          user_id: user!.id,
          plan_date: s.planDate,
          kind: s.kind,
          slot_index: s.slotIndex,
          slot_label: s.slotLabel,
          task_name: s.taskName,
          task_id: taskIds[0] ?? s.taskId ?? null,
          progress: s.progress,
          challenges: s.challenges || null,
          remarks: s.remarks || null,
          start_time: s.startTime || null,
          end_time: s.endTime || null,
        },
        { onConflict: 'user_id,plan_date,kind,slot_index' },
      )
        .select('id')
        .single()
      if (error) throw error
      await syncSlotTasks(saved.id, taskIds)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-slots'] })
      qc.invalidateQueries({ queryKey: ['slot-tasks'] })
    },
  })
}

// planning_slot_tasks is newer than the generated types.
const slotTasks = () => supabase.from('planning_slot_tasks' as 'planning_slots')

/** Make the slot's linked tasks exactly `taskIds`. */
async function syncSlotTasks(slotId: string, taskIds: string[]) {
  const { data, error } = await slotTasks()
    .select('task_id' as '*')
    .eq('slot_id' as 'id', slotId)
  if (error) {
    // Before the migration only one task per slot is possible.
    if (taskIds.length > 1)
      throw new Error(
        'Several tasks in one slot needs the pending database update. The first task was saved.',
      )
    return
  }
  const have = new Set(((data ?? []) as unknown as { task_id: string }[]).map((r) => r.task_id))
  const add = taskIds.filter((id) => !have.has(id))
  const drop = [...have].filter((id) => !taskIds.includes(id))
  if (add.length) {
    const { error: e } = await slotTasks().insert(
      add.map((task_id) => ({ slot_id: slotId, task_id })) as never,
    )
    if (e) throw e
  }
  if (drop.length) {
    const { error: e } = await slotTasks()
      .delete()
      .eq('slot_id' as 'id', slotId)
      .in('task_id' as 'id', drop)
    if (e) throw e
  }
}

/** Task ids linked to a slot (several tasks in one slot). */
export function useSlotTaskIds(slotId: string | null | undefined) {
  return useQuery({
    queryKey: ['slot-tasks', slotId],
    enabled: !!slotId,
    queryFn: async () => {
      const { data, error } = await slotTasks()
        .select('task_id' as '*')
        .eq('slot_id' as 'id', slotId!)
      if (error) return [] as string[]
      return ((data ?? []) as unknown as { task_id: string }[]).map((r) => r.task_id)
    },
  })
}

export function useDeleteSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase.from('planning_slots').delete().eq('id', slotId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planning-slots'] }),
  })
}

/**
 * Walks the day slots in start-time order and reports whether they cover the
 * whole working window — the client-side mirror of planning_day_fully_planned.
 * Returns the first uncovered time when they don't.
 */
export function planningCoverage(
  slots: Pick<PlanningSlot, 'start_time' | 'end_time'>[],
  dayStart: string,
  dayEnd: string,
): { covered: boolean; gapStart: string | null } {
  const norm = (t: string) => t.slice(0, 5)
  let cur = norm(dayStart)
  const end = norm(dayEnd)
  const valid = slots
    .filter((s) => s.start_time && s.end_time && s.end_time > s.start_time)
    .sort((a, b) => a.start_time!.localeCompare(b.start_time!))
  for (const s of valid) {
    if (norm(s.start_time!) > cur) return { covered: false, gapStart: cur }
    if (norm(s.end_time!) > cur) cur = norm(s.end_time!)
    if (cur >= end) return { covered: true, gapStart: null }
  }
  return cur >= end ? { covered: true, gapStart: null } : { covered: false, gapStart: cur }
}

export function usePlanningHistory(slotId: string | null) {
  return useQuery({
    queryKey: ['planning-history', slotId],
    enabled: !!slotId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planning_history')
        .select('*')
        .eq('slot_id', slotId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Admin: every user's day slots for a date, to show planning coverage. */
export function useDaySlotsForDate(planDate: string) {
  return useQuery({
    queryKey: ['admin-day-slots', planDate],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planning_slots')
        .select('user_id,start_time,end_time')
        .eq('plan_date', planDate)
        .eq('kind', 'day')
      if (error) throw error
      return data
    },
  })
}

export function useUserDayPlan(userId: string | null, date: string) {
  return useQuery({
    queryKey: ['user-day-plan', userId, date],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planning_slots')
        .select('*')
        .eq('user_id', userId!)
        .eq('plan_date', date)
        .eq('kind', 'day')
        .order('slot_index')
      if (error) throw error
      return data
    },
  })
}

/** Date-less unlock: lifts whatever day currently blocks the user's punch-in. */
export function useUnlockPlanning() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { userId: string; remarks: string }) => {
      const { error } = await supabase.rpc('unlock_planning', {
        p_user: args.userId,
        p_remarks: args.remarks,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['punch-lock-overview'] })
      qc.invalidateQueries({ queryKey: ['unlock-history'] })
      qc.invalidateQueries({ queryKey: ['punch-in-lock'] })
    },
  })
}

export type PunchLockEntry = { user_id: string; locked: boolean; prev_date?: string }

/** Admin view: current punch-lock state for every active employee. */
export function usePunchLockOverview() {
  return useQuery({
    queryKey: ['punch-lock-overview'],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('punch_lock_overview')
      if (error) throw error
      return (data ?? []) as PunchLockEntry[]
    },
  })
}

export type UnlockHistoryEntry = Tables<'planning_unlock_history'>

/**
 * Audit trail of admin unlocks, newest first, for a period of unlocked days
 * (`from` / `to` on the unlocked work date) and optionally one employee.
 */
export function useUnlockHistory(filter: { from?: string; to?: string; userId?: string } = {}) {
  return useQuery({
    queryKey: ['unlock-history', filter.from ?? '', filter.to ?? '', filter.userId ?? ''],
    queryFn: async () => {
      let q = supabase
        .from('planning_unlock_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (filter.from) q = q.gte('work_date', filter.from)
      if (filter.to) q = q.lte('work_date', filter.to)
      if (filter.userId) q = q.eq('user_id', filter.userId)
      const { data, error } = await q
      if (error) throw error
      return data as UnlockHistoryEntry[]
    },
  })
}

function invalidateUnlocks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['unlock-history'] })
  qc.invalidateQueries({ queryKey: ['punch-lock-overview'] })
  qc.invalidateQueries({ queryKey: ['punch-in-lock'] })
  qc.invalidateQueries({ queryKey: ['report'] })
}

/** Change the remark of an unlock (needs attendance.unlock). */
export function useEditUnlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; remarks: string }) => {
      const { error } = await supabase.rpc('edit_planning_unlock' as never, {
        p_id: input.id,
        p_remarks: input.remarks,
      } as never)
      if (error) throw error
    },
    onSuccess: () => invalidateUnlocks(qc),
  })
}

/** Undo an unlock: the day counts as not unlocked again (needs attendance.unlock). */
export function useRemoveUnlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('remove_planning_unlock' as never, { p_id: id } as never)
      if (error) throw error
    },
    onSuccess: () => invalidateUnlocks(qc),
  })
}

/** Is punch-in locked because the last worked day's planning is incomplete? */
export function usePunchInLock() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['punch-in-lock', user?.id],
    enabled: !!user,
    refetchInterval: 10_000, // picks up an admin unlock without a reload
    queryFn: async () => {
      const { data, error } = await supabase.rpc('punch_in_lock_status')
      if (error) throw error
      return data as { locked: boolean; prev_date?: string }
    },
  })
}

export function usePlanningRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) supabase.realtime.setAuth(data.session.access_token)
      channel = supabase
        .channel('planning-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_slots' }, () => {
          qc.invalidateQueries({ queryKey: ['admin-day-slots'] })
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'planning_compliance' },
          () => {
            qc.invalidateQueries({ queryKey: ['punch-lock-overview'] })
          },
        )
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [qc])
}
