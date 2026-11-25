import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** A colleague's work identity — what anyone signed in may see. */
export interface Person {
  id: string
  full_name: string
  email: string
  employee_code: string | null
  avatar_url: string | null
  status: string
  department_id: string | null
  team_id?: string | null
  reporting_manager_id?: string | null
  /** Designation name (people_directory only). */
  designation?: string | null
}

/**
 * Everyone in the organisation, for pickers (assign a task, give recognition)
 * and for showing names. Uses the `people_directory` function so employees see
 * colleagues too; where that function is not installed yet it falls back to
 * the profiles the caller can already read.
 */
export function usePeople() {
  return useQuery({
    queryKey: ['people-directory'],
    staleTime: 60_000,
    queryFn: async (): Promise<Person[]> => {
      const rpc = await supabase.rpc('people_directory' as never)
      if (!rpc.error) return (rpc.data as unknown as Person[]) ?? []
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name,email,employee_code,avatar_url,status,department_id,team_id,reporting_manager_id')
        .order('full_name')
      if (error) throw error
      return (data ?? []) as Person[]
    },
  })
}

/** Active people only, sorted by name — what a picker should offer. */
export function useActivePeople() {
  const query = usePeople()
  const active = useMemo(
    () =>
      (query.data ?? [])
        .filter((p) => p.status === 'active')
        .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
    [query.data],
  )
  return { ...query, data: active }
}

export const personName = (p: { full_name?: string | null; email?: string | null } | null | undefined) =>
  p?.full_name || p?.email || ''
