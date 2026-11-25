import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { safeFileName } from '@/lib/storageKey'
import { useAuth } from '@/features/auth/auth-context'

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface OfficeExpense {
  id: string
  expense_date: string
  category: string
  description: string
  vendor: string | null
  amount: number
  payment_mode: string | null
  reference_no: string | null
  bill_path: string | null
  bill_name: string | null
  status: ExpenseStatus
  remarks: string | null
  submitted_by: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

export const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

// office_expenses is newer than the generated types.
const table = () => supabase.from('office_expenses' as 'assets')

export function useOfficeExpenses(filter: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['office-expenses', filter.from ?? '', filter.to ?? ''],
    queryFn: async () => {
      let q = table()
        .select('*')
        .order('expense_date' as 'created_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000)
      if (filter.from) q = q.gte('expense_date' as 'created_at', filter.from)
      if (filter.to) q = q.lte('expense_date' as 'created_at', filter.to)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as OfficeExpense[]
    },
  })
}

export interface ExpenseInput {
  id?: string
  expense_date: string
  category: string
  description: string
  vendor?: string
  amount: number
  payment_mode?: string
  reference_no?: string
  remarks?: string
  /** A new bill to attach (replaces the current one). */
  bill?: File | null
  /** Remove the current bill without adding a new one. */
  removeBill?: boolean
  current?: OfficeExpense | null
}

export function useSaveExpense() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      if (!input.description.trim()) throw new Error('Description is required')
      if (!(input.amount > 0)) throw new Error('Amount must be more than 0')
      const values: Record<string, unknown> = {
        expense_date: input.expense_date,
        category: input.category,
        description: input.description.trim(),
        vendor: input.vendor?.trim() || null,
        amount: Math.round(input.amount * 100) / 100,
        payment_mode: input.payment_mode || null,
        reference_no: input.reference_no?.trim() || null,
        remarks: input.remarks?.trim() || null,
      }
      let uploaded: string | null = null
      if (input.bill) {
        // Bills live under the submitter's folder (the original one when editing).
        const owner = input.current?.submitted_by ?? user!.id
        uploaded = `expenses/${owner}/${crypto.randomUUID()}-${safeFileName(input.bill.name)}`
        const up = await supabase.storage.from('documents').upload(uploaded, input.bill)
        if (up.error) throw up.error
        values.bill_path = uploaded
        values.bill_name = input.bill.name
      } else if (input.removeBill) {
        values.bill_path = null
        values.bill_name = null
      }
      const { data, error } = input.id
        ? await table().update(values as never).eq('id', input.id).select('id')
        : await table().insert(values as never).select('id')
      if (error || !data?.length) {
        if (uploaded) await supabase.storage.from('documents').remove([uploaded])
        if (error) throw error
        throw new Error('Not allowed to save this expense')
      }
      // The old bill is replaced or removed: tidy up its file (best effort).
      const old = input.current?.bill_path
      if (old && (uploaded || input.removeBill)) {
        await supabase.storage.from('documents').remove([old])
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-expenses'] }),
  })
}

export function useSetExpenseStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: ExpenseStatus; remarks?: string }) => {
      const values: Record<string, unknown> = { status: input.status }
      if (input.remarks !== undefined) values.remarks = input.remarks.trim() || null
      const { data, error } = await table().update(values as never).eq('id', input.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to change this expense')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-expenses'] }),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (expense: OfficeExpense) => {
      const { data, error } = await table().delete().eq('id', expense.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to delete this expense')
      if (expense.bill_path) await supabase.storage.from('documents').remove([expense.bill_path])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-expenses'] }),
  })
}

export async function billUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 120)
  return error ? null : data.signedUrl
}
