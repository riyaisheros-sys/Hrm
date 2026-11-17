import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Org-wide "which sidebar items / dashboard widgets should employees see".
 * Absence of a row means visible — admin flips a specific key off to hide it
 * for everyone in the employee view. Per-user layout preferences still win
 * for ordering; this just gates visibility on top.
 */

export function useEmployeeSidebarPolicy() {
  return useQuery({
    queryKey: ['employee-sidebar-policy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_sidebar_policy')
        .select('item_key, is_visible')
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.item_key, r.is_visible] as const))
    },
  })
}

export function useEmployeeDashboardPolicy() {
  return useQuery({
    queryKey: ['employee-dashboard-policy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_dashboard_policy')
        .select('widget_id, is_visible')
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.widget_id, r.is_visible] as const))
    },
  })
}

export function useSetEmployeeSidebarItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { itemKey: string; visible: boolean }) => {
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await supabase.from('employee_sidebar_policy').upsert(
        {
          item_key: args.itemKey,
          is_visible: args.visible,
          updated_by: auth.user?.id ?? null,
        },
        { onConflict: 'item_key' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-sidebar-policy'] }),
  })
}

export function useSetEmployeeDashboardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { widgetId: string; visible: boolean }) => {
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await supabase.from('employee_dashboard_policy').upsert(
        {
          widget_id: args.widgetId,
          is_visible: args.visible,
          updated_by: auth.user?.id ?? null,
        },
        { onConflict: 'widget_id' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-dashboard-policy'] }),
  })
}
