import { useMemo, useState } from 'react'
import { Download, Eye, FileText, History, Pencil, Plus, Settings2, Trash2, Upload } from 'lucide-react'
import {
  downloadDocument,
  getDocumentUrl,
  useUpdateDocument,
  useDeleteDocument,
  useAllEmployeeDocuments,
  useDeleteDocumentType,
  useDocumentTypes,
  useEmployeeDocuments,
  useSaveDocumentType,
  useUploadDocument,
  type DocumentType,
  type EmployeeDocument,
} from './hooks'
import {
  useOnboarding,
  useOnboardingItems,
  useStartOnboarding,
  useUpdateItem,
  type OnboardingItem,
} from '@/features/onboarding/hooks'
import { useUsers } from '@/features/admin/users/hooks'
import { useToast } from '@/components/ui/toast-context'
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
import { EmptyState } from '@/components/ui/EmptyState'
import { FileInput } from '@/components/ui/FileInput'
import { usePeople } from '@/lib/people'
import { formatDateTime } from '@/lib/format'

const ITEM_STATUS: OnboardingItem['status'][] = ['pending', 'submitted', 'verified']

export function DocumentsPage() {
  const { data: users = [] } = useUsers()
  const [employeeId, setEmployeeId] = useState('')
  const effectiveUser = employeeId || users[0]?.id || ''
  const { data: docs = [] } = useEmployeeDocuments(effectiveUser)
  const { data: documentTypes = [] } = useDocumentTypes()
  const upload = useUploadDocument()
  const del = useDeleteDocument()
  const toast = useToast()
  const [files, setFiles] = useState<File[]>([])
  const [pickedType, setPickedType] = useState('')
  const docType = pickedType || documentTypes[0]?.code || ''
  const setDocType = setPickedType
  const [title, setTitle] = useState('')
  const [editingDoc, setEditingDoc] = useState<EmployeeDocument | null>(null)
  const { data: people = [] } = usePeople()
  const typeName = (code: string) =>
    documentTypes.find((t) => t.code === code)?.name ??
    code.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  const personName = (id: string | null) =>
    (id && (people.find((p) => p.id === id)?.full_name || people.find((p) => p.id === id)?.email)) ||
    '—'
  const employee = users.find((u) => u.id === effectiveUser)
  const [deleting, setDeleting] = useState<EmployeeDocument | null>(null)
  const [historyType, setHistoryType] = useState<string | null>(null)
  const [manageTypes, setManageTypes] = useState(false)
  const latestDocuments = useMemo(() => {
    const latest = new Map<string, EmployeeDocument>()
    for (const document of docs) {
      if (!latest.has(document.doc_type)) latest.set(document.doc_type, document)
    }
    return [...latest.values()]
  }, [docs])
  const historyDocuments = docs.filter((document) => document.doc_type === historyType)
  const latestPage = usePagination(latestDocuments, 25)
  const historyPage = usePagination(historyDocuments, 25, historyType)

  return (
    <div data-testid="documents-page">
      <PageHeader
        title="Doc Vault"
        description="Versioned, access-controlled document repository and the joining checklist."
        actions={
          <Button type="button" variant="outline" onClick={() => setManageTypes(true)}>
            <Settings2 className="size-4" /> Manage types
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody>
          <form
            className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[12rem_12rem_minmax(10rem,1fr)_minmax(16rem,1.4fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              const file = files[0]
              if (!file) {
                toast.error('Choose a file first')
                return
              }
              upload.mutate(
                { employeeId: effectiveUser, docType, title: title.trim() || file.name, file },
                {
                  onSuccess: () => {
                    toast.success('Document uploaded')
                    setTitle('')
                    setFiles([])
                  },
                  onError: (err) => toast.error('Upload failed', (err as Error).message),
                },
              )
            }}
          >
            <div>
              <Label htmlFor="doc-emp">Employee</Label>
              <Select
                id="doc-emp"
                data-testid="doc-employee-select"
                value={effectiveUser}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="doc-type">Category</Label>
              <Select
                id="doc-type"
                data-testid="doc-type-select"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {documentTypes.map((type) => (
                  <option key={type.id} value={type.code}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                data-testid="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to the file name"
              />
            </div>
            <div>
              <Label htmlFor="doc-file">File</Label>
              <FileInput id="doc-file" testid="doc-file" files={files} onChange={setFiles} />
            </div>
            <Button type="submit" data-testid="upload-document" loading={upload.isPending}>
              <Upload className="size-4" /> Upload
            </Button>
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-800" data-testid="docs-heading">
              {employee?.full_name || employee?.email || 'Employee'}'s documents
            </h2>
            <span className="text-xs text-slate-500">
              {latestDocuments.length} document{latestDocuments.length === 1 ? '' : 's'} ·{' '}
              {docs.length} file{docs.length === 1 ? '' : 's'} incl. older versions
            </span>
          </div>
          {docs.length === 0 ? (
            <EmptyState title="No documents for this employee" testid="docs-empty" />
          ) : (
            <Table data-testid="documents-table">
              <Thead>
                <tr>
                  <Th>Category</Th>
                  <Th>Title</Th>
                  <Th>Version</Th>
                  <Th>Uploaded</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </Thead>
              <Tbody>
                {latestPage.pagedItems.map((d) => {
                  const versions = docs.filter((document) => document.doc_type === d.doc_type).length
                  return (
                    <tr key={d.id} data-testid="document-row">
                      <Td>
                        <Badge tone="brand" data-testid="doc-category">
                          {typeName(d.doc_type)}
                        </Badge>
                      </Td>
                      <Td className="max-w-72">
                        <span className="flex items-center gap-2 font-medium text-slate-900">
                          <FileText className="size-4 shrink-0 text-slate-400" />
                          <span className="truncate" title={d.title}>
                            {d.title}
                          </span>
                        </span>
                      </Td>
                      <Td data-testid="doc-version" className="whitespace-nowrap">
                        v{d.version}
                        {versions > 1 && (
                          <span className="ml-1 text-xs text-slate-400">({versions} versions)</span>
                        )}
                      </Td>
                      <Td className="text-xs whitespace-nowrap text-slate-500">
                        {formatDateTime(d.created_at)}
                        <div>by {personName(d.uploaded_by)}</div>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            data-testid="download-document"
                            className="text-brand-600 hover:bg-brand-50 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium"
                            onClick={async () => {
                              const url = await getDocumentUrl(d.id, d.storage_path)
                              if (url) window.open(url, '_blank')
                              else toast.error('Could not open document')
                            }}
                          >
                            <Eye className="size-3.5" /> View
                          </button>
                          <button
                            data-testid="save-document"
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            onClick={async () => {
                              const ok = await downloadDocument(d)
                              if (!ok) toast.error('Could not download document')
                            }}
                          >
                            <Download className="size-3.5" /> Download
                          </button>
                          {versions > 1 && (
                            <button
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                              onClick={() => setHistoryType(d.doc_type)}
                            >
                              <History className="size-3.5" /> History
                            </button>
                          )}
                          <button
                            data-testid="edit-document"
                            aria-label={`Edit ${d.title}`}
                            className="hover:text-brand-600 rounded p-1 text-slate-400"
                            onClick={() => setEditingDoc(d)}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            data-testid="delete-document"
                            aria-label={`Delete ${d.title}`}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => setDeleting(d)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </Tbody>
            </Table>
          )}
          <Pagination {...latestPage} testid="latest-docs-pagination" />
        </div>

        <JoiningChecklist employeeId={effectiveUser} />
      </div>

      <DocumentsByEmployee
        users={users}
        typeNames={new Map(documentTypes.map((t) => [t.code, t.name]))}
        selectedId={effectiveUser}
        onSelect={(id) => {
          setEmployeeId(id)
          document.querySelector('[data-testid="app-main"]')?.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title="Delete document"
          testid="doc-delete-modal"
        >
          <p className="text-sm text-slate-600">
            Permanently delete <strong>{deleting.title}</strong> (v{deleting.version}) and its file?
            This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-delete-document"
              loading={del.isPending}
              onClick={() =>
                del.mutate(
                  { id: deleting.id, storage_path: deleting.storage_path },
                  {
                    onSuccess: () => {
                      toast.success('Document deleted')
                      setDeleting(null)
                    },
                    onError: (e) => toast.error('Delete failed', (e as Error).message),
                  },
                )
              }
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
      {historyType && (
        <Modal
          open
          onClose={() => setHistoryType(null)}
          title="Version history"
          testid="document-version-history"
        >
          <div className="space-y-2">
            {historyPage.pagedItems.map((document) => (
              <div
                key={document.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"
              >
                <span className="min-w-0">
                  <strong>v{document.version}</strong> · {document.title}
                  <span className="block text-xs text-slate-500">
                    {formatDateTime(document.created_at)} · by {personName(document.uploaded_by)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const url = await getDocumentUrl(document.id, document.storage_path)
                    if (url) window.open(url, '_blank')
                    else toast.error('Could not open document')
                  }}
                >
                  <Download className="size-4" /> Open
                </Button>
              </div>
            ))}
          </div>
          <Pagination {...historyPage} testid="doc-history-pagination" />
        </Modal>
      )}
      {manageTypes && <DocumentTypesModal onClose={() => setManageTypes(false)} />}
      {editingDoc && (
        <EditDocumentModal
          doc={editingDoc}
          types={documentTypes}
          onClose={() => setEditingDoc(null)}
        />
      )}
    </div>
  )
}

function EditDocumentModal({
  doc,
  types,
  onClose,
}: {
  doc: EmployeeDocument
  types: DocumentType[]
  onClose: () => void
}) {
  const update = useUpdateDocument()
  const toast = useToast()
  const [title, setTitle] = useState(doc.title)
  const [docType, setDocType] = useState(doc.doc_type)
  return (
    <Modal open onClose={onClose} title="Edit document" testid="edit-document-modal">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate(
            { id: doc.id, title, docType },
            {
              onSuccess: () => {
                toast.success('Document updated')
                onClose()
              },
              onError: (err) => toast.error('Could not update', (err as Error).message),
            },
          )
        }}
      >
        <div>
          <Label htmlFor="edit-doc-title">Title</Label>
          <Input
            id="edit-doc-title"
            data-testid="edit-doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="edit-doc-type">Category</Label>
          <Select
            id="edit-doc-type"
            data-testid="edit-doc-type"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            {types.map((t) => (
              <option key={t.id} value={t.code}>
                {t.name}
              </option>
            ))}
            {!types.some((t) => t.code === doc.doc_type) && (
              <option value={doc.doc_type}>{doc.doc_type}</option>
            )}
          </Select>
        </div>
        <p className="text-xs text-slate-500">The file itself stays the same; upload again for a new version.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="save-document-edit" loading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DocumentTypesModal({ onClose }: { onClose: () => void }) {
  const { data: types = [] } = useDocumentTypes(true)
  const save = useSaveDocumentType()
  const remove = useDeleteDocumentType()
  const toast = useToast()
  const [editing, setEditing] = useState<DocumentType | null>(null)
  const [name, setName] = useState('')

  function beginEdit(type?: DocumentType) {
    setEditing(type ?? null)
    setName(type?.name ?? '')
  }

  return (
    <Modal open onClose={onClose} title="Manage document types" testid="document-types-modal">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate(
            {
              id: editing?.id,
              name,
              code: editing?.code || name,
              isActive: editing?.is_active ?? true,
            },
            {
              onSuccess: () => {
                toast.success(editing ? 'Document type updated' : 'Document type created')
                beginEdit()
              },
              onError: (error) => toast.error('Save failed', (error as Error).message),
            },
          )
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Document type name"
          required
        />
        <Button type="submit" loading={save.isPending}>
          <Plus className="size-4" /> {editing ? 'Save' : 'Add'}
        </Button>
      </form>
      <div className="max-h-80 space-y-2 overflow-auto">
        {types.map((type) => (
          <div
            key={type.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm"
          >
            <span>
              {type.name} <span className="text-slate-400">({type.code})</span>
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  save.mutate(
                    { id: type.id, name: type.name, code: type.code, isActive: !type.is_active },
                    { onError: (error) => toast.error('Update failed', (error as Error).message) },
                  )
                }
              >
                {type.is_active ? 'Active' : 'Inactive'}
              </Button>
              <button
                className="rounded p-1 text-slate-500"
                onClick={() => beginEdit(type)}
                aria-label={`Edit ${type.name}`}
              >
                <Pencil className="size-4" />
              </button>
              <button
                className="rounded p-1 text-red-500"
                onClick={() =>
                  remove.mutate(type.id, {
                    onError: (error) => toast.error('Delete failed', (error as Error).message),
                  })
                }
                aria-label={`Delete ${type.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/** New-joiner document checklist for the selected employee (moved from Communication). */
function JoiningChecklist({ employeeId }: { employeeId: string }) {
  const { data: onboarding } = useOnboarding(employeeId)
  const { data: items = [] } = useOnboardingItems(onboarding?.id ?? null)
  const start = useStartOnboarding()
  const updateItem = useUpdateItem()
  const toast = useToast()

  return (
    <Card data-testid="joining-checklist-card">
      <CardBody className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Joining checklist
        </h2>
        {!onboarding ? (
          <Button
            data-testid="start-onboarding"
            loading={start.isPending}
            disabled={!employeeId}
            onClick={() =>
              start.mutate(employeeId, { onSuccess: () => toast.success('Onboarding started') })
            }
          >
            Start onboarding
          </Button>
        ) : (
          <ul className="space-y-2" data-testid="checklist">
            {items.map((it) => (
              <li
                key={it.id}
                data-testid="checklist-item"
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{it.label}</span>
                <Select
                  data-testid={`item-status-${it.item_key}`}
                  value={it.status}
                  onChange={(e) =>
                    updateItem.mutate({
                      id: it.id,
                      status: e.target.value as OnboardingItem['status'],
                    })
                  }
                  className="h-8 w-32"
                >
                  {ITEM_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

/**
 * Admin overview: one row per employee with every document they have on file
 * (latest version of each type). Click a document to open it, or "View" to
 * load that employee in the vault above. Employees with nothing uploaded are
 * listed too, so gaps are visible at a glance.
 */
function DocumentsByEmployee({
  users,
  typeNames,
  selectedId,
  onSelect,
}: {
  users: Array<{ id: string; full_name: string; email: string; employee_code: string | null }>
  typeNames: Map<string, string>
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { data: all = [], isLoading } = useAllEmployeeDocuments()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [only, setOnly] = useState<'all' | 'with' | 'without'>('all')

  const rows = useMemo(() => {
    const byEmployee = new Map<string, EmployeeDocument[]>()
    for (const doc of all) {
      const list = byEmployee.get(doc.employee_id) ?? []
      // `all` is newest-first, so the first one seen per type is the latest.
      if (!list.some((d) => d.doc_type === doc.doc_type)) list.push(doc)
      byEmployee.set(doc.employee_id, list)
    }
    const q = search.trim().toLowerCase()
    return users
      .map((u) => ({ user: u, docs: byEmployee.get(u.id) ?? [] }))
      .filter(({ user, docs }) => {
        if (only === 'with' && docs.length === 0) return false
        if (only === 'without' && docs.length > 0) return false
        if (!q) return true
        return [user.full_name, user.email, user.employee_code ?? '', ...docs.map((d) => d.title)]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) =>
        (a.user.full_name || a.user.email).localeCompare(b.user.full_name || b.user.email),
      )
  }, [all, users, search, only])
  const page = usePagination(rows, 25, `${search}|${only}`)

  return (
    <Card className="mt-6">
      <CardBody data-testid="documents-by-employee">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Uploaded documents by employee</h2>
            <p className="text-xs text-slate-500">
              {all.length} file{all.length === 1 ? '' : 's'} on record across {users.length}{' '}
              employees. Click a document to open it.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              data-testid="docs-by-employee-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or document"
              className="w-56"
            />
            <Select
              data-testid="docs-by-employee-filter"
              value={only}
              onChange={(e) => setOnly(e.target.value as 'all' | 'with' | 'without')}
              className="w-44"
            >
              <option value="all">All employees</option>
              <option value="with">With documents</option>
              <option value="without">Nothing uploaded</option>
            </Select>
          </div>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No employees match" testid="docs-by-employee-empty" />
        ) : (
          <Table data-testid="docs-by-employee-table">
            <Thead>
              <tr>
                <Th className="w-10">S.No</Th>
                <Th>Employee</Th>
                <Th>Documents on file</Th>
                <Th>Last upload</Th>
                <Th className="w-px" />
              </tr>
            </Thead>
            <Tbody>
              {page.pagedItems.map(({ user, docs }, i) => (
                <tr
                  key={user.id}
                  data-testid="docs-by-employee-row"
                  className={user.id === selectedId ? 'bg-brand-50/40' : undefined}
                >
                  <Td className="text-xs text-slate-400 tabular-nums">{page.pageStart + i + 1}</Td>
                  <Td className="font-medium text-slate-900">
                    {user.full_name || user.email}
                    <div className="text-xs font-normal text-slate-500">
                      {user.employee_code ? `${user.employee_code} · ` : ''}
                      {user.email}
                    </div>
                  </Td>
                  <Td>
                    {docs.length === 0 ? (
                      <span className="text-xs text-slate-400">Nothing uploaded</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {docs.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            title={`${d.title} · v${d.version} — click to open`}
                            className="hover:border-brand-300 hover:text-brand-700 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                            onClick={async () => {
                              const url = await getDocumentUrl(d.id, d.storage_path)
                              if (url) window.open(url, '_blank')
                              else toast.error('Could not open document')
                            }}
                          >
                            <Download className="size-3" />
                            {typeNames.get(d.doc_type) ?? d.doc_type}
                            <span className="text-slate-400">v{d.version}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-slate-500">
                    {docs.length
                      ? new Date(
                          Math.max(...docs.map((d) => new Date(d.created_at).getTime())),
                        ).toLocaleDateString()
                      : '—'}
                  </Td>
                  <Td>
                    <Button size="sm" variant="outline" onClick={() => onSelect(user.id)}>
                      View
                    </Button>
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
        <Pagination {...page} testid="docs-by-employee-pagination" />
      </CardBody>
    </Card>
  )
}
