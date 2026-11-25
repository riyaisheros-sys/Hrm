import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export type LifecycleEvent = Tables<'lifecycle_events'>
export type Resignation = Tables<'resignations'>
export type ExitClearance = Tables<'exit_clearances'>

export function useLifecycleEvents(employeeId: string | null) {
  return useQuery({
    queryKey: ['lifecycle', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lifecycle_events')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('event_date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useAddEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employeeId: string
      eventType: string
      eventDate: string
      note?: string
    }) => {
      const { error } = await supabase.from('lifecycle_events').insert({
        employee_id: input.employeeId,
        event_type: input.eventType,
        event_date: input.eventDate,
        note: input.note || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lifecycle'] }),
  })
}

/** Correct an existing timeline event (type, date or note). */
export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      eventType: string
      eventDate: string
      note?: string
    }) => {
      const { error } = await supabase
        .from('lifecycle_events')
        .update({
          event_type: input.eventType,
          event_date: input.eventDate,
          note: input.note?.trim() || null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lifecycle'] }),
  })
}

/** Remove a single timeline entry that was recorded by mistake. */
export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from('lifecycle_events').delete().eq('id', eventId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lifecycle'] }),
  })
}

/** Wipe an employee's entire timeline. Exit management (resignation/clearances) is untouched. */
export function useDeleteAllEvents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from('lifecycle_events')
        .delete()
        .eq('employee_id', employeeId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lifecycle'] }),
  })
}

export function useResignation(employeeId: string | null) {
  return useQuery({
    queryKey: ['resignation', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resignations')
        .select('*')
        .eq('employee_id', employeeId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useClearances(resignationId: string | null) {
  return useQuery({
    queryKey: ['clearances', resignationId],
    enabled: !!resignationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exit_clearances')
        .select('*')
        .eq('resignation_id', resignationId!)
        .order('clearance_type')
      if (error) throw error
      return data
    },
  })
}

export function useStartExit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { employeeId: string; lastWorkingDate: string; reason?: string }) => {
      const { error } = await supabase.rpc('start_exit', {
        p_employee: input.employeeId,
        p_last_working_date: input.lastWorkingDate,
        p_reason: input.reason ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resignation'] })
      qc.invalidateQueries({ queryKey: ['lifecycle'] })
      qc.invalidateQueries({ queryKey: ['clearances'] })
    },
  })
}

function invalidateExit(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['resignation'] })
  qc.invalidateQueries({ queryKey: ['clearances'] })
  qc.invalidateQueries({ queryKey: ['lifecycle'] })
}

/** Change an exit's last working day, reason or status (lifecycle.manage). */
export function useUpdateResignation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      lastWorkingDate: string
      reason: string
      status: 'pending' | 'in_clearance' | 'completed'
    }) => {
      const { data, error } = await supabase
        .from('resignations')
        .update({
          last_working_date: input.lastWorkingDate,
          reason: input.reason.trim() || null,
          status: input.status,
        })
        .eq('id', input.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to edit this exit')
    },
    onSuccess: () => invalidateExit(qc),
  })
}

/** Withdraw an exit: removes it and its clearance checklist. */
export function useWithdrawExit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('resignations').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to withdraw this exit')
    },
    onSuccess: () => invalidateExit(qc),
  })
}

/** Put a cleared item back to pending (needs the lifecycle migration). */
export function useUndoClearance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('exit_clearances')
        .update({ status: 'pending', cleared_by: null, cleared_at: null })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data?.length)
        throw new Error('Undoing a clearance needs the pending database update.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clearances'] }),
  })
}

export function useClearItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (clearanceId: string) => {
      const { error } = await supabase.rpc('clear_exit_item', { p_clearance: clearanceId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clearances'] }),
  })
}
