import { useState, type ReactNode } from 'react'
import { Check, Plus, FileText, ExternalLink, ListChecks, Pencil, Trash2, X } from 'lucide-react'
import {
  getCandidateDocUrl,
  useAddCandidate,
  useCandidateChecklist,
  useCandidateDocuments,
  useCandidates,
  useDeleteCandidate,
  useDeleteOpening,
  useSaveCandidateDetails,
  useSaveOpening,
  useInterviews,
  useOpenings,
  useSaveFeedback,
  useScheduleInterview,
  useSendOffer,
  useDecideOffer,
  useStartCandidateChecklist,
  useUpdateCandidate,
  useUpdateChecklistItem,
  useUploadCandidateDocument,
  type Candidate,
  type InterviewRow,
  type OpeningRow,
} from './hooks'
import { useProfile } from '@/features/rbac/profile-context'
import { useActivePeople, usePeople } from '@/lib/people'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Textarea } from '@/components/ui/Textarea'
import { formatDate } from '@/lib/format'
import { useDepartments } from '@/features/admin/hierarchy/hooks'
import { useUsers } from '@/features/admin/users/hooks'
import { useToast } from '@/components/ui/toast-context'
import { generateLetterPdf } from '@/lib/pdfLetter'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { cn } from '@/lib/cn'

const STATUSES = ['applied', 'interview', 'selected', 'rejected', 'joined']
const STATUS_TONE: Record<string, 'slate' | 'blue' | 'green' | 'red' | 'amber'> = {
  applied: 'slate',
  interview: 'blue',
  selected: 'amber',
  rejected: 'red',
  joined: 'green',
}
const OPENING_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'slate' }> = {
  open: { label: 'Open', tone: 'green' },
  on_hold: { label: 'On hold', tone: 'amber' },
  closed: { label: 'Closed', tone: 'slate' },
}
const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]
const SOURCES = [
  'Job portal',
  'LinkedIn',
  'Referral',
  'Company website',
  'Walk-in',
  'Consultancy',
  'Campus',
  'Other',
]
const label = (v: string) => v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const inr = (v: unknown) =>
  v == null || v === '' ? '—' : `₹${Math.round(Number(v)).toLocaleString('en-IN')}`
/** Read a column that may not exist yet on an older database. */
const field = <T,>(row: object, key: string) => (row as Record<string, T | undefined>)[key]

export function RecruitmentPage() {
  const { hasPermission } = useProfile()
  const canManage = hasPermission('recruitment.manage')
  const { data: openings = [] } = useOpenings()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = openings.find((o) => o.id === selectedId) ?? openings[0] ?? null
  const { data: candidates = [] } = useCandidates(selected?.id ?? null)
  const [stageFilter, setStageFilter] = useState('')
  const shown = stageFilter ? candidates.filter((c) => c.status === stageFilter) : candidates
  const candidatesPage = usePagination(shown, 25, `${selected?.id}|${stageFilter}`)
  const [openingModal, setOpeningModal] = useState<OpeningRow | 'new' | null>(null)
  const [candidateModal, setCandidateModal] = useState<Candidate | 'new' | null>(null)
  const [deleteOpening, setDeleteOpening] = useState<OpeningRow | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<Candidate | null>(null)
  const [manageId, setManageId] = useState<string | null>(null)
  const managed = candidates.find((c) => c.id === manageId) ?? null
  const removeOpening = useDeleteOpening()
  const removeCandidate = useDeleteCandidate()
  const { data: people = [] } = usePeople()
  const toast = useToast()
  const countBy = (status: string) => candidates.filter((c) => c.status === status).length

  return (
    <div data-testid="recruitment-page">
      <PageHeader
        title="Recruitment"
        description="Openings, candidates, interviews and offer approvals."
        actions={
          canManage && (
            <Button data-testid="new-opening-button" onClick={() => setOpeningModal('new')}>
              <Plus className="size-4" /> New opening
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardBody className="space-y-1">
            <p className="px-1 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Openings ({openings.length})
            </p>
            {openings.map((o) => {
              const st = OPENING_STATUS[o.status] ?? OPENING_STATUS.open
              return (
                <button
                  key={o.id}
                  data-testid="opening-item"
                  onClick={() => {
                    setSelectedId(o.id)
                    setStageFilter('')
                  }}
                  className={cn(
                    'flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm',
                    selected?.id === o.id ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-100',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{o.designation}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </span>
                  <span className="text-xs text-slate-400">
                    {o.department?.name ?? 'No department'}
                    {field<string>(o, 'location') ? ` · ${field<string>(o, 'location')}` : ''}
                  </span>
                </button>
              )
            })}
          </CardBody>
        </Card>

        {selected && (
          <div className="space-y-3">
            <Card data-testid="opening-details">
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{selected.designation}</h2>
                    <p className="text-sm text-slate-500">
                      {selected.department?.name ?? 'No department'}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="edit-opening"
                        onClick={() => setOpeningModal(selected)}
                      >
                        <Pencil className="size-4" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="delete-opening"
                        onClick={() => setDeleteOpening(selected)}
                      >
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <Detail term="Positions" value={field<number>(selected, 'positions')} />
                  <Detail
                    term="Type"
                    value={
                      field<string>(selected, 'employment_type')
                        ? label(field<string>(selected, 'employment_type')!)
                        : null
                    }
                  />
                  <Detail term="Location" value={field<string>(selected, 'location')} />
                  <Detail term="Experience" value={field<string>(selected, 'experience_required')} />
                  <Detail term="Salary range" value={field<string>(selected, 'salary_range')} />
                  <Detail
                    term="Closing date"
                    value={
                      field<string>(selected, 'closing_date')
                        ? formatDate(field<string>(selected, 'closing_date')!)
                        : null
                    }
                  />
                  <Detail
                    term="Hiring manager"
                    value={
                      people.find((p) => p.id === field<string>(selected, 'hiring_manager_id'))
                        ?.full_name
                    }
                  />
                  <Detail
                    term="Status"
                    value={(OPENING_STATUS[selected.status] ?? OPENING_STATUS.open).label}
                  />
                </dl>
                {selected.description && (
                  <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600">
                    {selected.description}
                  </p>
                )}
              </CardBody>
            </Card>

            <div className="flex flex-wrap items-center gap-2" data-testid="pipeline-summary">
              <button
                type="button"
                onClick={() => setStageFilter('')}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium',
                  !stageFilter
                    ? 'border-brand-300 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-600',
                )}
              >
                All <span className="ml-1 font-bold">{candidates.length}</span>
              </button>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`pipeline-${s}`}
                  onClick={() => setStageFilter(stageFilter === s ? '' : s)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium',
                    stageFilter === s
                      ? 'border-brand-300 bg-brand-50 text-brand-800'
                      : 'border-slate-200 bg-white text-slate-600',
                  )}
                >
                  {label(s)} <span className="ml-1 font-bold">{countBy(s)}</span>
                </button>
              ))}
              {canManage && (
                <Button
                  size="sm"
                  className="ml-auto"
                  data-testid="add-candidate-button"
                  onClick={() => setCandidateModal('new')}
                >
                  <Plus className="size-4" /> Add candidate
                </Button>
              )}
            </div>

            <Table data-testid="candidates-table">
              <Thead>
                <tr>
                  <Th>Candidate</Th>
                  <Th>Experience</Th>
                  <Th>CTC (current → expected)</Th>
                  <Th>Notice</Th>
                  <Th>Source</Th>
                  <Th>Status</Th>
                  <Th>Offer</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </Thead>
              <Tbody>
                {candidatesPage.pagedItems.map((c) => (
                  <tr key={c.id} data-testid="candidate-row">
                    <Td className="font-medium text-slate-900">
                      {c.full_name}
                      <div className="text-xs font-normal text-slate-500">
                        {c.email}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </div>
                      {(field<string>(c, 'current_designation') ||
                        field<string>(c, 'current_company')) && (
                        <div className="text-xs font-normal text-slate-500">
                          {[field<string>(c, 'current_designation'), field<string>(c, 'current_company')]
                            .filter(Boolean)
                            .join(' @ ')}
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">
                      {field<number>(c, 'experience_years') != null
                        ? `${field<number>(c, 'experience_years')} yrs`
                        : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">
                      {inr(field(c, 'current_ctc'))} → {inr(field(c, 'expected_ctc'))}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">
                      {field<number>(c, 'notice_period_days') != null
                        ? `${field<number>(c, 'notice_period_days')} days`
                        : '—'}
                    </Td>
                    <Td className="text-slate-600">{field<string>(c, 'source') || '—'}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[c.status] ?? 'slate'} data-testid="candidate-status">
                        {label(c.status)}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={c.offer_status === 'approved' ? 'green' : 'slate'}>
                        {c.offer_status}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          data-testid="manage-candidate"
                          className="text-brand-600 hover:bg-brand-50 rounded px-2 py-1 text-xs font-medium"
                          onClick={() => setManageId(c.id)}
                        >
                          Manage
                        </button>
                        {canManage && (
                          <>
                            <button
                              data-testid="edit-candidate"
                              aria-label={`Edit ${c.full_name}`}
                              className="hover:text-brand-600 rounded p-1 text-slate-400"
                              onClick={() => setCandidateModal(c)}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              data-testid="delete-candidate"
                              aria-label={`Delete ${c.full_name}`}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => setDeleteCandidate(c)}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <Td colSpan={8} className="py-6 text-center text-slate-400">
                      No candidates {stageFilter ? `at ${label(stageFilter)}` : 'yet'}.
                    </Td>
                  </tr>
                )}
              </Tbody>
            </Table>
            <Pagination {...candidatesPage} testid="candidates-pagination" />
          </div>
        )}
      </div>

      {openingModal && (
        <OpeningModal
          opening={openingModal === 'new' ? null : openingModal}
          onClose={() => setOpeningModal(null)}
        />
      )}
      {candidateModal && selected && (
        <CandidateModal
          openingId={selected.id}
          candidate={candidateModal === 'new' ? null : candidateModal}
          onClose={() => setCandidateModal(null)}
        />
      )}
      {managed && <ManageCandidateModal candidate={managed} onClose={() => setManageId(null)} />}
      {deleteOpening && (
        <ConfirmDialog
          title="Delete opening"
          testid="delete-opening-dialog"
          confirmLabel="Delete opening"
          loading={removeOpening.isPending}
          onClose={() => setDeleteOpening(null)}
          message={
            <p>
              Delete <span className="font-semibold text-slate-900">{deleteOpening.designation}</span>?
              Its {deleteOpening.id === selected?.id ? candidates.length : ''} candidate(s), their
              interviews, documents and checklists are deleted too. This cannot be undone.
            </p>
          }
          onConfirm={() =>
            removeOpening.mutate(deleteOpening.id, {
              onSuccess: () => {
                toast.success('Opening deleted')
                setDeleteOpening(null)
                setSelectedId(null)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
      {deleteCandidate && (
        <ConfirmDialog
          title="Delete candidate"
          testid="delete-candidate-dialog"
          confirmLabel="Delete candidate"
          loading={removeCandidate.isPending}
          onClose={() => setDeleteCandidate(null)}
          message={
            <p>
              Delete <span className="font-semibold text-slate-900">{deleteCandidate.full_name}</span>?
              Their interviews, documents and checklist are deleted too. This cannot be undone.
            </p>
          }
          onConfirm={() =>
            removeCandidate.mutate(deleteCandidate.id, {
              onSuccess: () => {
                toast.success('Candidate deleted')
                setDeleteCandidate(null)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
    </div>
  )
}

function Detail({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{term}</dt>
      <dd className="truncate text-slate-800">{value || value === 0 ? value : '—'}</dd>
    </div>
  )
}

function OpeningModal({ opening, onClose }: { opening: OpeningRow | null; onClose: () => void }) {
  const save = useSaveOpening()
  const { data: departments = [] } = useDepartments()
  const { data: people = [] } = useActivePeople()
  const toast = useToast()
  const o = (opening ?? {}) as Record<string, unknown>
  const s = (k: string) => (o[k] == null ? '' : String(o[k]))
  const [departmentId, setDepartmentId] = useState(opening?.department_id ?? '')
  const [designation, setDesignation] = useState(opening?.designation ?? '')
  const [status, setStatus] = useState(opening?.status ?? 'open')
  const [description, setDescription] = useState(opening?.description ?? '')
  const [positions, setPositions] = useState(s('positions'))
  const [location, setLocation] = useState(s('location'))
  const [employmentType, setEmploymentType] = useState(s('employment_type'))
  const [experience, setExperience] = useState(s('experience_required'))
  const [salaryRange, setSalaryRange] = useState(s('salary_range'))
  const [closingDate, setClosingDate] = useState(s('closing_date'))
  const [hiringManager, setHiringManager] = useState(s('hiring_manager_id'))

  return (
    <Modal
      open
      onClose={onClose}
      title={opening ? 'Edit opening' : 'New opening'}
      testid="opening-modal"
      size="wide"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(
            {
              id: opening?.id,
              before: opening,
              departmentId,
              designation,
              description,
              status,
              details: {
                positions: positions ? Number(positions) : null,
                location: location.trim() || null,
                employment_type: employmentType || null,
                experience_required: experience.trim() || null,
                salary_range: salaryRange.trim() || null,
                closing_date: closingDate || null,
                hiring_manager_id: hiringManager || null,
              },
            },
            {
              onSuccess: () => {
                toast.success(opening ? 'Opening updated' : 'Opening created')
                onClose()
              },
              onError: (err) => toast.error('Failed', (err as Error).message),
            },
          )
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="op-dept">Department</Label>
            <Select
              id="op-dept"
              data-testid="opening-department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              required
            >
              <option value="">— Select department —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="op-desig">Designation</Label>
            <Input
              id="op-desig"
              data-testid="opening-designation"
              placeholder="e.g. Senior Frontend Engineer"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="op-positions">Number of positions</Label>
            <Input
              id="op-positions"
              data-testid="opening-positions"
              type="number"
              min={1}
              value={positions}
              onChange={(e) => setPositions(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="op-type">Employment type</Label>
            <Select
              id="op-type"
              data-testid="opening-type"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            >
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="op-location">Location</Label>
            <Input
              id="op-location"
              data-testid="opening-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Mumbai / Remote"
            />
          </div>
          <div>
            <Label htmlFor="op-exp">Experience required</Label>
            <Input
              id="op-exp"
              data-testid="opening-experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="e.g. 2–4 years"
            />
          </div>
          <div>
            <Label htmlFor="op-salary">Salary range</Label>
            <Input
              id="op-salary"
              data-testid="opening-salary"
              value={salaryRange}
              onChange={(e) => setSalaryRange(e.target.value)}
              placeholder="e.g. ₹3–5 LPA"
            />
          </div>
          <div>
            <Label htmlFor="op-closing">Closing date</Label>
            <Input
              id="op-closing"
              data-testid="opening-closing"
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="op-manager">Hiring manager</Label>
            <Select
              id="op-manager"
              data-testid="opening-manager"
              value={hiringManager}
              onChange={(e) => setHiringManager(e.target.value)}
            >
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="op-status">Status</Label>
            <Select
              id="op-status"
              data-testid="opening-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {Object.entries(OPENING_STATUS).map(([value, st]) => (
                <option key={value} value={value}>
                  {st.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="op-desc">Job description</Label>
          <Textarea
            id="op-desc"
            data-testid="opening-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Responsibilities, skills, qualifications…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="create-opening-submit" loading={save.isPending}>
            {opening ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CandidateModal({
  openingId,
  candidate,
  onClose,
}: {
  openingId: string
  candidate: Candidate | null
  onClose: () => void
}) {
  const add = useAddCandidate()
  const saveDetails = useSaveCandidateDetails()
  const upload = useUploadCandidateDocument()
  const toast = useToast()
  const c = (candidate ?? {}) as Record<string, unknown>
  const s = (k: string) => (c[k] == null ? '' : String(c[k]))
  const [fullName, setFullName] = useState(candidate?.full_name ?? '')
  const [email, setEmail] = useState(candidate?.email ?? '')
  const [phone, setPhone] = useState(candidate?.phone ?? '')
  const [currentCompany, setCurrentCompany] = useState(s('current_company'))
  const [currentDesignation, setCurrentDesignation] = useState(s('current_designation'))
  const [experience, setExperience] = useState(s('experience_years'))
  const [currentCtc, setCurrentCtc] = useState(s('current_ctc'))
  const [expectedCtc, setExpectedCtc] = useState(s('expected_ctc'))
  const [notice, setNotice] = useState(s('notice_period_days'))
  const [location, setLocation] = useState(s('location'))
  const [source, setSource] = useState(s('source'))
  const [referredBy, setReferredBy] = useState(s('referred_by'))
  const [skills, setSkills] = useState(s('skills'))
  const [notes, setNotes] = useState(s('notes'))
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))
  const details = {
    current_company: currentCompany.trim() || null,
    current_designation: currentDesignation.trim() || null,
    experience_years: numOrNull(experience),
    current_ctc: numOrNull(currentCtc),
    expected_ctc: numOrNull(expectedCtc),
    notice_period_days: numOrNull(notice),
    location: location.trim() || null,
    source: source || null,
    referred_by: referredBy.trim() || null,
    skills: skills.trim() || null,
    notes: notes.trim() || null,
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={candidate ? `Edit ${candidate.full_name}` : 'Add candidate'}
      testid="add-candidate-modal"
      size="wide"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (candidate) {
            saveDetails.mutate(
              { id: candidate.id, before: candidate, fullName, email, phone, details },
              {
                onSuccess: () => {
                  toast.success('Candidate updated')
                  onClose()
                },
                onError: (err) => toast.error('Failed', (err as Error).message),
              },
            )
            return
          }
          setSaving(true)
          add.mutate(
            {
              openingId,
              fullName: fullName.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              details,
            },
            {
              onSuccess: async (created) => {
                try {
                  for (const file of files) {
                    await upload.mutateAsync({ candidateId: created.id, title: file.name, file })
                  }
                  toast.success(
                    'Candidate added',
                    files.length ? `${files.length} document(s) attached` : undefined,
                  )
                  onClose()
                } catch (err) {
                  toast.error(
                    'Candidate saved, but a document failed to upload',
                    (err as Error).message,
                  )
                  onClose()
                } finally {
                  setSaving(false)
                }
              },
              onError: (err) => {
                setSaving(false)
                toast.error('Failed', (err as Error).message)
              },
            },
          )
        }}
      >
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Contact</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="cd-name">Full name</Label>
            <Input
              id="cd-name"
              data-testid="candidate-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="cd-email">Email</Label>
            <Input
              id="cd-email"
              data-testid="candidate-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="cd-phone">Phone</Label>
            <Input
              id="cd-phone"
              data-testid="candidate-phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-location">Current location</Label>
            <Input
              id="cd-location"
              data-testid="candidate-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-source">Source</Label>
            <Select
              id="cd-source"
              data-testid="candidate-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">—</option>
              {SOURCES.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cd-ref">Referred by</Label>
            <Input
              id="cd-ref"
              data-testid="candidate-referred-by"
              value={referredBy}
              onChange={(e) => setReferredBy(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Experience &amp; compensation
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="cd-company">Current company</Label>
            <Input
              id="cd-company"
              data-testid="candidate-company"
              value={currentCompany}
              onChange={(e) => setCurrentCompany(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-desig">Current designation</Label>
            <Input
              id="cd-desig"
              data-testid="candidate-designation"
              value={currentDesignation}
              onChange={(e) => setCurrentDesignation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-exp">Total experience (years)</Label>
            <Input
              id="cd-exp"
              data-testid="candidate-experience"
              type="number"
              min={0}
              step={0.5}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-cctc">Current CTC (₹ / year)</Label>
            <Input
              id="cd-cctc"
              data-testid="candidate-current-ctc"
              type="number"
              min={0}
              value={currentCtc}
              onChange={(e) => setCurrentCtc(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-ectc">Expected CTC (₹ / year)</Label>
            <Input
              id="cd-ectc"
              data-testid="candidate-expected-ctc"
              type="number"
              min={0}
              value={expectedCtc}
              onChange={(e) => setExpectedCtc(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-notice">Notice period (days)</Label>
            <Input
              id="cd-notice"
              data-testid="candidate-notice"
              type="number"
              min={0}
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cd-skills">Key skills</Label>
            <Textarea
              id="cd-skills"
              data-testid="candidate-skills"
              rows={2}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cd-notes">Notes</Label>
            <Textarea
              id="cd-notes"
              data-testid="candidate-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        {!candidate && (
          <div>
            <Label htmlFor="cd-files">Attachments (resume, documents)</Label>
            <Input
              id="cd-files"
              data-testid="candidate-files"
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">{files.map((f) => f.name).join(', ')}</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="create-candidate-submit"
            loading={add.isPending || saving || saveDetails.isPending}
          >
            {candidate ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ManageCandidateModal({
  candidate,
  onClose,
}: {
  candidate: Candidate
  onClose: () => void
}) {
  const { data: users = [] } = useUsers()
  const { data: interviews = [] } = useInterviews(candidate.id)
  const update = useUpdateCandidate()
  const schedule = useScheduleInterview()
  const sendOffer = useSendOffer()
  const decideOffer = useDecideOffer()
  const toast = useToast()
  const [date, setDate] = useState('')
  const [interviewerId, setInterviewerId] = useState('')
  const [interviewRound, setInterviewRound] = useState('Round 1')

  function genLetter() {
    generateLetterPdf(
      `offer-${candidate.full_name.replace(/\s+/g, '-').toLowerCase()}`,
      'Offer Letter',
      [
        `Dear ${candidate.full_name},`,
        `We are pleased to offer you a position at HRMS Demo Company. This letter confirms the details of your offer following a successful interview process.`,
        `Please review and confirm your acceptance. We look forward to welcoming you to the team.`,
        `Sincerely,\nHuman Resources`,
      ],
    )
  }

  return (
    <Modal open onClose={onClose} title={candidate.full_name} testid="candidate-modal">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Label className="mb-0">Status</Label>
          <Select
            data-testid="candidate-status-select"
            value={candidate.status}
            onChange={(e) =>
              update.mutate(
                { id: candidate.id, status: e.target.value as Candidate['status'] },
                { onSuccess: () => toast.success('Status updated') },
              )
            }
            className="w-52"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Badge
            tone={candidate.offer_status === 'approved' ? 'green' : 'slate'}
            data-testid="offer-status"
          >
            offer: {candidate.offer_status}
          </Badge>
        </div>

        {/* Schedule interview */}
        <form
          className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            schedule.mutate(
              {
                candidateId: candidate.id,
                scheduledAt: new Date(date).toISOString(),
                interviewerId: interviewerId || null,
                mode: 'video',
                interviewRound: interviewRound.trim(),
              },
              {
                onSuccess: () => {
                  toast.success('Interview scheduled')
                  setDate('')
                },
                onError: (err) => toast.error('Failed', (err as Error).message),
              },
            )
          }}
        >
          <div>
            <Label className="text-xs">Interview date</Label>
            <Input
              data-testid="interview-date"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <Input
              data-testid="interview-round"
              value={interviewRound}
              onChange={(e) => setInterviewRound(e.target.value)}
              placeholder="e.g. Technical Round 1"
              required
            />
          </div>
          <div>
            <Label className="text-xs">Interviewer</Label>
            <Select
              data-testid="interview-interviewer"
              value={interviewerId}
              onChange={(e) => setInterviewerId(e.target.value)}
              className="w-44"
            >
              <option value="">— None —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="submit"
            size="sm"
            data-testid="schedule-interview"
            loading={schedule.isPending}
          >
            Schedule
          </Button>
        </form>

        {/* Interviews + feedback */}
        <ul className="space-y-2" data-testid="interviews-list">
          {interviews.map((iv) => (
            <InterviewItem key={iv.id} interview={iv} />
          ))}
        </ul>

        {/* Offer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {candidate.offer_status === 'none' && (
            <Button
              size="sm"
              variant="outline"
              data-testid="send-offer"
              loading={sendOffer.isPending}
              onClick={() =>
                sendOffer.mutate(
                  { id: candidate.id, full_name: candidate.full_name },
                  { onSuccess: () => toast.success('Offer sent for approval') },
                )
              }
            >
              Send offer for approval
            </Button>
          )}
          {candidate.offer_status === 'pending' && (
            <>
              <Button
                size="sm"
                data-testid="approve-offer"
                loading={decideOffer.isPending}
                onClick={() =>
                  decideOffer.mutate(
                    { id: candidate.id, decision: 'approved' },
                    { onSuccess: () => toast.success('Offer approved') },
                  )
                }
              >
                <Check className="size-4" /> Approve offer
              </Button>
              <Button
                size="sm"
                variant="danger"
                data-testid="reject-offer"
                onClick={() =>
                  decideOffer.mutate(
                    { id: candidate.id, decision: 'rejected' },
                    { onSuccess: () => toast.info('Offer rejected') },
                  )
                }
              >
                <X className="size-4" /> Reject
              </Button>
            </>
          )}
          {candidate.offer_status === 'approved' && (
            <Button size="sm" data-testid="generate-offer-letter" onClick={genLetter}>
              <FileText className="size-4" /> Generate offer letter
            </Button>
          )}
        </div>

        <CandidateDocumentsSection candidateId={candidate.id} />
        <CandidateChecklistSection candidateId={candidate.id} />

        <div className="flex justify-end">
          <Button variant="outline" data-testid="close-candidate" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CandidateDocumentsSection({ candidateId }: { candidateId: string }) {
  const { data: docs = [] } = useCandidateDocuments(candidateId)
  const upload = useUploadCandidateDocument()
  const toast = useToast()

  return (
    <div className="border-t border-slate-100 pt-3" data-testid="candidate-documents">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Documents</h3>
        <label className="text-brand-600 hover:bg-brand-50 cursor-pointer rounded px-2 py-1 text-xs font-medium">
          Upload
          <input
            type="file"
            data-testid="candidate-doc-upload"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              upload.mutate(
                { candidateId, title: file.name, file },
                {
                  onSuccess: () => toast.success('Document uploaded'),
                  onError: (err) => toast.error('Upload failed', (err as Error).message),
                },
              )
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {docs.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="candidate-docs-empty">
          No documents yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li
              key={d.id}
              data-testid="candidate-doc-row"
              className="flex items-center justify-between rounded border border-slate-100 px-2 py-1.5 text-sm"
            >
              <span className="truncate text-slate-700">{d.title}</span>
              <button
                data-testid="candidate-doc-view"
                className="text-brand-600 ml-2 flex shrink-0 items-center gap-1 text-xs font-medium hover:underline"
                onClick={async () => {
                  try {
                    const url = await getCandidateDocUrl(d.storage_path)
                    window.open(url, '_blank', 'noopener')
                  } catch (err) {
                    toast.error('Could not open document', (err as Error).message)
                  }
                }}
              >
                <ExternalLink className="size-3" /> View
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CHECKLIST_STATUSES = ['pending', 'sent', 'received', 'verified'] as const
const CHECKLIST_TONE: Record<string, 'slate' | 'blue' | 'amber' | 'green'> = {
  pending: 'slate',
  sent: 'blue',
  received: 'amber',
  verified: 'green',
}

function CandidateChecklistSection({ candidateId }: { candidateId: string }) {
  const { data: items = [], isLoading } = useCandidateChecklist(candidateId)
  const start = useStartCandidateChecklist()
  const update = useUpdateChecklistItem()
  const toast = useToast()

  return (
    <div className="border-t border-slate-100 pt-3" data-testid="candidate-checklist">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Communication checklist</h3>
        {!isLoading && items.length === 0 && (
          <Button
            size="sm"
            variant="outline"
            data-testid="start-checklist"
            loading={start.isPending}
            onClick={() =>
              start.mutate(candidateId, {
                onSuccess: () => toast.success('Checklist started'),
                onError: (err) => toast.error('Failed', (err as Error).message),
              })
            }
          >
            <ListChecks className="size-4" /> Start checklist
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="checklist-empty">
          Track documents sent to and received from this candidate — start the checklist.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="checklist-items">
          {items.map((it) => (
            <li
              key={it.id}
              data-testid={`checklist-item-${it.item_key}`}
              className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1.5 text-sm"
            >
              <span className="text-slate-700">{it.label}</span>
              <div className="flex items-center gap-2">
                <Badge tone={CHECKLIST_TONE[it.status] ?? 'slate'}>{it.status}</Badge>
                <Select
                  data-testid={`checklist-status-${it.item_key}`}
                  value={it.status}
                  onChange={(e) =>
                    update.mutate(
                      { id: it.id, status: e.target.value },
                      {
                        onSuccess: () => toast.success('Checklist updated'),
                        onError: (err) => toast.error('Failed', (err as Error).message),
                      },
                    )
                  }
                  className="h-8 w-32"
                >
                  {CHECKLIST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InterviewItem({ interview }: { interview: InterviewRow }) {
  const save = useSaveFeedback()
  const toast = useToast()
  const [rating, setRating] = useState(String(interview.rating ?? 5))
  const [recommendation, setRecommendation] = useState(interview.recommendation ?? 'proceed')
  const [feedback, setFeedback] = useState(interview.feedback ?? '')

  return (
    <li data-testid="interview-row" className="rounded-lg border border-slate-100 p-3">
      <p className="text-sm font-medium text-slate-700">
        {new Date(interview.scheduled_at).toLocaleString()} ·{' '}
        {interview.interview_round || 'Round not set'} · {interview.interviewer?.full_name ?? 'TBD'}
      </p>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(
            { interviewId: interview.id, feedback, rating: Number(rating), recommendation },
            {
              onSuccess: () => toast.success('Feedback saved'),
              onError: (err) => toast.error('Failed', (err as Error).message),
            },
          )
        }}
      >
        <Select
          data-testid="feedback-rating"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="h-9 w-20"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
        <Select
          data-testid="feedback-recommendation"
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value)}
          className="h-9 w-32"
        >
          <option value="proceed">Proceed</option>
          <option value="hold">Hold</option>
          <option value="reject">Reject</option>
        </Select>
        <Input
          data-testid="feedback-text"
          placeholder="Feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="h-9 w-48"
        />
        <Button type="submit" size="sm" data-testid="save-feedback" loading={save.isPending}>
          Save
        </Button>
      </form>
    </li>
  )
}
