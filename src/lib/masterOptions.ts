import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Module masters that store a `code` in the module's own text column. */
export type ModuleMaster =
  | 'recognition_awards'
  | 'announcement_categories'
  | 'visit_purposes'
  | 'asset_types'
  | 'workflow_entity_types'
  | 'expense_categories'

export interface MasterOption {
  code: string
  name: string
  is_active?: boolean
  points?: number
}

/** Lists the modules used before their masters existed (fallbacks). */
export const FALLBACK_ASSET_TYPES: MasterOption[] = [
  { code: 'laptop', name: 'Laptop' },
  { code: 'desktop', name: 'Desktop' },
  { code: 'mobile', name: 'Mobile' },
  { code: 'sim', name: 'SIM' },
  { code: 'id_card', name: 'ID card' },
  { code: 'headset', name: 'Headset' },
  { code: 'other', name: 'Other' },
]

export const FALLBACK_VISIT_PURPOSES: MasterOption[] = [
  { code: 'client_meeting', name: 'Client meeting' },
  { code: 'interview', name: 'Interview' },
  { code: 'vendor', name: 'Vendor / supplier' },
  { code: 'delivery', name: 'Delivery' },
  { code: 'internal_meeting', name: 'Internal meeting' },
  { code: 'personal', name: 'Personal' },
  { code: 'other', name: 'Other' },
]

const humanize = (code: string) =>
  code.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const table = (name: ModuleMaster) => supabase.from(name as 'task_categories')

/**
 * Options for a module's dropdown, managed in Centralized Masters.
 * `fallback` is the list the module used before the master existed — used
 * when the master table is not there yet, so the form keeps working.
 */
export function useMasterOptions(name: ModuleMaster, fallback: MasterOption[]) {
  const query = useQuery({
    queryKey: ['module-master', name],
    staleTime: 60_000,
    queryFn: async (): Promise<{ items: MasterOption[]; fromMaster: boolean }> => {
      const columns =
        name === 'recognition_awards'
          ? 'code,name,is_active,sort_order,points'
          : 'code,name,is_active,sort_order'
      const { data, error } = await table(name).select(columns).order('sort_order').order('name')
      if (error) return { items: fallback, fromMaster: false }
      return { items: (data ?? []) as unknown as MasterOption[], fromMaster: true }
    },
  })
  const all = useMemo(() => query.data?.items ?? fallback, [query.data, fallback])
  const options = useMemo(() => all.filter((o) => o.is_active !== false), [all])
  const labelOf = useMemo(() => {
    const byCode = new Map(all.map((o) => [o.code, o.name]))
    return (code: string | null | undefined) => (code ? (byCode.get(code) ?? humanize(code)) : '—')
  }, [all])
  return {
    options,
    all,
    labelOf,
    /** False until the master table exists (before the migration). */
    fromMaster: query.data?.fromMaster ?? false,
    isLoading: query.isLoading,
  }
}

/** Add an item to a module master (needs that module's manage right). */
export function useAddMasterOption(name: ModuleMaster) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; points?: number }) => {
      const label = input.name.trim()
      if (!label) throw new Error('Name is required')
      const code = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      if (!code) throw new Error('Use letters or numbers in the name')
      const values: Record<string, unknown> = { code, name: label, sort_order: 100 }
      if (name === 'recognition_awards' && input.points != null) values.points = input.points
      const { error } = await table(name).insert(values as never)
      if (error) {
        if (error.code === '23505') throw new Error(`"${label}" already exists`)
        throw error
      }
      return code
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-master', name] })
      qc.invalidateQueries({ queryKey: ['central-master', name] })
    },
  })
}
