import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Tables } from '@/types/database.types'

export type Designation = Tables<'designations'>
export type PerformanceItem = Tables<'performance_items'>
export type AppraisalItemScore = Tables<'appraisal_item_scores'>
export type ItemKind = 'kra' | 'kpi'
export type ScoringRole = 'employee' | 'manager' | 'hr'

/** Automatic scoring logics a KRA / KPI can be tied to. */
export const SYSTEM_METRICS: { value: string; label: string; logic: string }[] = [
  {
    value: 'attendance',
    label: 'Attendance',
    logic: 'Day-credits ÷ recorded days (full = 1, half = 0.5, quarter = 0.25, absent = 0)',
  },
  { value: 'punctuality', label: 'Punctuality', logic: 'On-time days ÷ worked days' },
  {
    value: 'task_completion',
    label: 'Task completion',
    logic: 'Completed tasks ÷ tasks assigned in the period',
  },
  {
    value: 'task_on_time',
    label: 'Tasks on time',
    logic: 'Tasks finished on or before the due date ÷ completed tasks with a due date',
  },
  { value: 'planning', label: 'Planning', logic: 'Fully planned days ÷ worked days' },
  {
    value: 'planning_discipline',
    label: 'Planning discipline',
    logic: 'Planning entries made on time ÷ all planning entries (late = entered after the slot ended)',
  },
]
export const metricLabel = (value: string | null) =>
  SYSTEM_METRICS.find((m) => m.value === value)?.label ?? null

// ── Master: KRA / KPI items ────────────────────────────────────────────────

export function usePerformanceItems() {
  return useQuery({
    queryKey: ['performance-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_items')
        .select('*')
        .order('kind')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useSavePerformanceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      kind: ItemKind
      name: string
      description?: string | null
      system_metric?: string | null
      is_active?: boolean
    }) => {
      if (!input.name.trim()) throw new Error('Name is required')
      const values = {
        kind: input.kind,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        system_metric: input.system_metric || null,
        is_active: input.is_active ?? true,
      }
      const { error } = input.id
        ? await supabase.from('performance_items').update(values).eq('id', input.id)
        : await supabase.from('performance_items').insert(values)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['performance-items'] }),
  })
}

export function useDeletePerformanceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('performance_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['performance-items'] })
      qc.invalidateQueries({ queryKey: ['designation-items'] })
      qc.invalidateQueries({ queryKey: ['user-performance-items'] })
    },
  })
}

// ── Designations and their default KRA / KPI ───────────────────────────────

export function useDesignations() {
  return useQuery({
    queryKey: ['designations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('designations')
        .select('*')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useSaveDesignation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; department_id: string; name: string }) => {
      if (!input.name.trim()) throw new Error('Designation name is required')
      if (!input.department_id) throw new Error('Pick a department')
      const values = { department_id: input.department_id, name: input.name.trim() }
      const { error } = input.id
        ? await supabase.from('designations').update(values).eq('id', input.id)
        : await supabase.from('designations').insert(values)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
  })
}

export function useDeleteDesignation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('designations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['designations'] })
      qc.invalidateQueries({ queryKey: ['designation-items'] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

/** designation id → set of default item ids. */
export function useDesignationItems() {
  return useQuery({
    queryKey: ['designation-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('designation_performance_items').select('*')
      if (error) throw error
      const map = new Map<string, Set<string>>()
      for (const row of data ?? []) {
        const set = map.get(row.designation_id) ?? new Set<string>()
        set.add(row.item_id)
        map.set(row.designation_id, set)
      }
      return map
    },
  })
}

export function useToggleDesignationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { designationId: string; itemId: string; on: boolean }) => {
      const { error } = input.on
        ? await supabase
            .from('designation_performance_items')
            .upsert({ designation_id: input.designationId, item_id: input.itemId })
        : await supabase
            .from('designation_performance_items')
            .delete()
            .eq('designation_id', input.designationId)
            .eq('item_id', input.itemId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['designation-items'] }),
  })
}

// ── Per-user KRA / KPI ──────────────────────────────────────────────────────

export function useUserPerformanceItems(userId: string | null) {
  return useQuery({
    queryKey: ['user-performance-items', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_performance_items')
        .select('item_id')
        .eq('user_id', userId!)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.item_id))
    },
  })
}

/** Make the user's KRA / KPI list exactly `itemIds` (adds and removes). */
export async function setUserPerformanceItems(userId: string, itemIds: string[]) {
  const { data: current, error: readError } = await supabase
    .from('user_performance_items')
    .select('item_id')
    .eq('user_id', userId)
  if (readError) throw readError
  const have = new Set((current ?? []).map((r) => r.item_id))
  const want = new Set(itemIds)
  const toAdd = itemIds.filter((id) => !have.has(id))
  const toRemove = [...have].filter((id) => !want.has(id))
  if (toAdd.length) {
    const { error } = await supabase
      .from('user_performance_items')
      .insert(toAdd.map((item_id) => ({ user_id: userId, item_id })))
    if (error) throw error
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from('user_performance_items')
      .delete()
      .eq('user_id', userId)
      .in('item_id', toRemove)
    if (error) throw error
  }
}

// ── Appraisal scorecard ─────────────────────────────────────────────────────

/** Builds / refreshes the scorecard rows, then returns them with the caller's roles. */
export function useAppraisalScorecard(appraisalId: string | null) {
  return useQuery({
    queryKey: ['appraisal-scorecard', appraisalId],
    enabled: !!appraisalId,
    queryFn: async () => {
      const init = await supabase.rpc('init_appraisal_items' as never, {
        p_appraisal: appraisalId,
      } as never)
      if (init.error) throw init.error
      const roles = await supabase.rpc('appraisal_scoring_roles' as never, {
        p_appraisal: appraisalId,
      } as never)
      if (roles.error) throw roles.error
      const { data, error } = await supabase
        .from('appraisal_item_scores')
        .select('*')
        .eq('appraisal_id', appraisalId!)
        .order('kind')
        .order('sort_order')
        .order('item_name')
      if (error) throw error
      return {
        rows: (data ?? []) as AppraisalItemScore[],
        roles: ((roles.data as unknown as string[]) ?? []) as ScoringRole[],
      }
    },
  })
}

export function useSaveAppraisalScores(appraisalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      changes: Array<{
        scoreId: string
        role: ScoringRole
        value: number | null
        remarks: string
      }>,
    ) => {
      for (const change of changes) {
        const { error } = await supabase.rpc('save_appraisal_item_score' as never, {
          p_score: change.scoreId,
          p_role: change.role,
          p_value: change.value,
          p_remarks: change.remarks,
        } as never)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appraisal-scorecard', appraisalId] })
      qc.invalidateQueries({ queryKey: ['appraisal-history'] })
    },
  })
}

/** Appraisals of the people who report to the signed-in user (manager view). */
export function useTeamAppraisals() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['team-appraisals', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: reports, error: rErr } = await supabase
        .from('profiles')
        .select('id,full_name,email')
        .eq('reporting_manager_id', user!.id)
      if (rErr) throw rErr
      if (!reports?.length) return []
      const { data, error } = await supabase
        .from('appraisals')
        .select('id,user_id,overall_score,cycle:appraisal_cycles(name,period_start,period_end,status)')
        .in(
          'user_id',
          reports.map((r) => r.id),
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      const byId = new Map(reports.map((r) => [r.id, r]))
      return (data ?? []).map((a) => ({
        id: a.id,
        employee: byId.get(a.user_id)?.full_name || byId.get(a.user_id)?.email || '—',
        overall: a.overall_score,
        cycle: a.cycle as unknown as {
          name: string
          period_start: string
          period_end: string
          status: string
        } | null,
      }))
    },
  })
}
