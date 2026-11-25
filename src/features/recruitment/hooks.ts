import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { safeFileName } from '@/lib/storageKey'
import type { Tables } from '@/types/database.types'

export type Opening = Tables<'job_openings'>
export type Candidate = Tables<'candidates'>
export type CandidateDocument = Tables<'candidate_documents'>
export type CandidateChecklistItem = Tables<'candidate_checklist_items'>

export interface OpeningRow extends Opening {
  department: { name: string } | null
}

export interface InterviewRow extends Tables<'interviews'> {
  interviewer: { full_name: string } | null
}

export function useOpenings() {
  return useQuery({
    queryKey: ['openings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_openings')
        .select('*, department:departments(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as OpeningRow[]
    },
  })
}

/** Details added to openings / candidates on 26 Nov (all optional). */
export interface OpeningDetails {
  positions?: number | null
  location?: string | null
  employment_type?: string | null
  experience_required?: string | null
  salary_range?: string | null
  closing_date?: string | null
  hiring_manager_id?: string | null
}
export interface CandidateDetails {
  current_company?: string | null
  current_designation?: string | null
  experience_years?: number | null
  current_ctc?: number | null
  expected_ctc?: number | null
  notice_period_days?: number | null
  location?: string | null
  source?: string | null
  referred_by?: string | null
  skills?: string | null
  notes?: string | null
}

/**
 * Only send detail fields that have a value (new rows) or that changed
 * (existing rows), so saving keeps working on a database that does not have
 * the new columns yet.
 */
function detailPatch<T extends object>(details: T, before?: Record<string, unknown> | null) {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(details)) {
    const value = raw === '' || raw === undefined ? null : raw
    if (before) {
      if (!(key in before) && value == null) continue
      if ((before[key] ?? null) === value) continue
    } else if (value == null) continue
    out[key] = value
  }
  return out
}

export function useSaveOpening() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      before?: OpeningRow | null
      departmentId: string
      designation: string
      description?: string
      status?: string
      details: OpeningDetails
    }) => {
      if (!input.designation.trim()) throw new Error('Designation is required')
      const base: Record<string, unknown> = {
        title: input.designation.trim(),
        designation: input.designation.trim(),
        department_id: input.departmentId || null,
        description: input.description?.trim() || null,
      }
      if (input.status) base.status = input.status
      const values = {
        ...base,
        ...detailPatch(input.details, input.before as unknown as Record<string, unknown>),
      }
      if (input.id) {
        const { data, error } = await supabase
          .from('job_openings')
          .update(values as never)
          .eq('id', input.id)
          .select('id')
        if (error) throw error
        if (!data?.length) throw new Error('Not allowed to edit this opening')
      } else {
        const { error } = await supabase.from('job_openings').insert(values as never)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['openings'] }),
  })
}

/** Deletes an opening and (by cascade) its candidates, interviews and documents rows. */
export function useDeleteOpening() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('job_openings').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to delete this opening')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openings'] })
      qc.invalidateQueries({ queryKey: ['candidates'] })
    },
  })
}

export function useSaveCandidateDetails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      before: Candidate
      fullName: string
      email: string
      phone?: string
      details: CandidateDetails
    }) => {
      const values = {
        full_name: input.fullName.trim(),
        email: input.email.trim(),
        phone: input.phone?.trim() || null,
        ...detailPatch(input.details, input.before as unknown as Record<string, unknown>),
      }
      const { data, error } = await supabase
        .from('candidates')
        .update(values as never)
        .eq('id', input.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to edit this candidate')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  })
}

export function useDeleteCandidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('candidates').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Not allowed to delete this candidate')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  })
}

export function useCreateOpening() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      departmentId: string
      designation: string
      description?: string
    }) => {
      const { error } = await supabase.from('job_openings').insert({
        // Openings are identified by department + designation; title mirrors the
        // designation for backwards compatibility (column is NOT NULL).
        title: input.designation,
        designation: input.designation,
        department_id: input.departmentId,
        description: input.description || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['openings'] }),
  })
}

export function useCandidates(openingId: string | null) {
  return useQuery({
    queryKey: ['candidates', openingId],
    enabled: !!openingId,
    refetchInterval: 5000, // reflect offer-approval (workflow trigger) promptly
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .eq('opening_id', openingId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useAddCandidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      openingId: string
      fullName: string
      email: string
      phone?: string
      details?: CandidateDetails
    }) => {
      const { data, error } = await supabase
        .from('candidates')
        .insert({
          opening_id: input.openingId,
          full_name: input.fullName,
          email: input.email,
          phone: input.phone || null,
          ...detailPatch(input.details ?? {}),
        } as never)
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  })
}

export function useUpdateCandidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      status?: Candidate['status']
      offer_status?: Candidate['offer_status']
    }) => {
      const patch: { status?: Candidate['status']; offer_status?: Candidate['offer_status'] } = {}
      if (input.status) patch.status = input.status
      if (input.offer_status) patch.offer_status = input.offer_status
      const { error } = await supabase.from('candidates').update(patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  })
}

/** Mark the offer as sent; it awaits an in-place approve/reject decision. */
export function useSendOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (candidate: { id: string; full_name: string }) => {
      const { error } = await supabase
        .from('candidates')
        .update({ offer_status: 'pending' })
        .eq('id', candidate.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  })
}

/** Approve or reject a pending offer directly on the candidate. */
export function useDecideOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; decision: 'approved' | 'rejected' }) => {
      const { error } = await supabase
        .from('candidates')
        .update({ offer_status: input.decision })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  })
}

export interface CandidateDocRow extends CandidateDocument {
  uploader: { full_name: string } | null
}

export function useCandidateDocuments(candidateId: string | null) {
  return useQuery({
    queryKey: ['candidate-documents', candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_documents')
        .select('*, uploader:profiles(full_name)')
        .eq('candidate_id', candidateId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as CandidateDocRow[]
    },
  })
}

export function useUploadCandidateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { candidateId: string; title: string; file: File }) => {
      const path = `candidates/${input.candidateId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`
      const up = await supabase.storage
        .from('documents')
        .upload(path, input.file, { upsert: false })
      if (up.error) throw up.error
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await supabase.from('candidate_documents').insert({
        candidate_id: input.candidateId,
        title: input.title || input.file.name,
        storage_path: path,
        uploaded_by: auth.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidate-documents'] }),
  })
}

export async function getCandidateDocUrl(path: string) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}

export function useCandidateChecklist(candidateId: string | null) {
  return useQuery({
    queryKey: ['candidate-checklist', candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_checklist_items')
        .select('*')
        .eq('candidate_id', candidateId!)
        .order('item_key')
      if (error) throw error
      return data
    },
  })
}

export function useStartCandidateChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.rpc('start_candidate_checklist', {
        p_candidate: candidateId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidate-checklist'] }),
  })
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: string; note?: string }) => {
      const patch: { status: string; note?: string | null } = { status: input.status }
      if (input.note !== undefined) patch.note = input.note || null
      const { error } = await supabase
        .from('candidate_checklist_items')
        .update(patch)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidate-checklist'] }),
  })
}

export function useInterviews(candidateId: string | null) {
  return useQuery({
    queryKey: ['interviews', candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interviews')
        .select('*, interviewer:profiles(full_name)')
        .eq('candidate_id', candidateId!)
        .order('scheduled_at')
      if (error) throw error
      return (data ?? []) as unknown as InterviewRow[]
    },
  })
}

export function useScheduleInterview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      candidateId: string
      scheduledAt: string
      interviewerId: string | null
      mode: string
      interviewRound: string
    }) => {
      const { error } = await supabase.from('interviews').insert({
        candidate_id: input.candidateId,
        scheduled_at: input.scheduledAt,
        interviewer_id: input.interviewerId,
        mode: input.mode,
        interview_round: input.interviewRound,
      })
      if (error) throw error
      await supabase.from('candidates').update({ status: 'interview' }).eq('id', input.candidateId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interviews'] })
      qc.invalidateQueries({ queryKey: ['candidates'] })
    },
  })
}

export function useSaveFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      interviewId: string
      feedback: string
      rating: number
      recommendation: string
    }) => {
      const { error } = await supabase
        .from('interviews')
        .update({
          feedback: input.feedback,
          rating: input.rating,
          recommendation: input.recommendation,
        })
        .eq('id', input.interviewId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interviews'] }),
  })
}
