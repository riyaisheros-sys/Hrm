import { FALLBACK_ASSET_TYPES, useMasterOptions } from '@/lib/masterOptions'
import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  useActiveAssignments,
  useAssetAssignments,
  useAssets,
  useAssignAsset,
  useCreateAsset,
  useDeleteAsset,
  useReturnAsset,
  useTransferAsset,
  useUpdateAsset,
  type Asset,
} from './hooks'
import { useUsers } from '@/features/admin/users/hooks'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { SortFilterTh } from '@/components/ui/SortFilterTh'
import { useTableControls } from '@/lib/useTableControls'
import { EmptyState } from '@/components/ui/EmptyState'

// Asset condition is a free-text column (default 'good'); these are the presets offered.
const ASSET_CONDITIONS = [
  { code: 'good', name: 'Good' },
  { code: 'fair', name: 'Fair' },
  { code: 'poor', name: 'Poor' },
  { code: 'damaged', name: 'Damaged' },
  { code: 'under_repair', name: 'Under repair' },
  { code: 'lost', name: 'Lost' },
]
const conditionLabel = (code: string) =>
  ASSET_CONDITIONS.find((c) => c.code === code)?.name ?? code.replace(/_/g, ' ')

export function AssetsPage() {
  const assetTypes = useMasterOptions('asset_types', FALLBACK_ASSET_TYPES)
  const { data: assets = [] } = useAssets()
  const { data: holders } = useActiveAssignments()
  const [createOpen, setCreateOpen] = useState(false)
  const [manage, setManage] = useState<Asset | null>(null)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [deleting, setDeleting] = useState<Asset | null>(null)
  const del = useDeleteAsset()
  const toast = useToast()
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return assets
    return assets.filter((a) =>
      [a.name, a.serial, a.batch_no, a.asset_type].some((f) => (f ?? '').toLowerCase().includes(q)),
    )
  }, [assets, search])
  const controls = useTableControls(visible, {
    name: (a) => a.name,
    type: (a) => assetTypes.labelOf(a.asset_type),
    serial: (a) => a.serial,
    batch: (a) => a.batch_no,
    status: (a) => a.status,
    holder: (a) => holders?.get(a.id),
  })
  const assetsPage = usePagination(controls.rows, 25, `${search}|${controls.stateKey}`)

  return (
    <div data-testid="assets-page">
      <PageHeader
        title="Assets"
        description="Track company assets by serial & batch number, and their assignment history."
        actions={
          <Button data-testid="new-asset-button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New asset
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="asset-search"
            placeholder="Search name, serial or batch no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No assets found" testid="assets-empty" />
      ) : (
        <Table data-testid="assets-table">
          <Thead>
            <tr>
              <SortFilterTh controls={controls} k="name">Asset</SortFilterTh>
              <SortFilterTh controls={controls} k="type">Type</SortFilterTh>
              <SortFilterTh controls={controls} k="serial">Serial no</SortFilterTh>
              <SortFilterTh controls={controls} k="batch">Batch no</SortFilterTh>
              <SortFilterTh controls={controls} k="status">Status</SortFilterTh>
              <SortFilterTh controls={controls} k="holder">Assigned to</SortFilterTh>
              <Th className="text-right">Manage</Th>
            </tr>
          </Thead>
          <Tbody>
            {assetsPage.pagedItems.map((a) => (
              <tr key={a.id} data-testid="asset-row">
                <Td className="font-medium text-slate-900">{a.name}</Td>
                <Td>{assetTypes.labelOf(a.asset_type)}</Td>
                <Td className="font-mono text-xs" data-testid="asset-serial-cell">{a.serial || '—'}</Td>
                <Td className="font-mono text-xs" data-testid="asset-batch-cell">{a.batch_no || '—'}</Td>
                <Td>
                  <Badge tone={a.status === 'assigned' ? 'amber' : a.status === 'retired' ? 'slate' : 'green'} data-testid="asset-status">
                    {a.status}
                  </Badge>
                </Td>
                <Td className="text-slate-600" data-testid="asset-holder-cell">{holders?.get(a.id) ?? '—'}</Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      data-testid="manage-asset"
                      className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                      onClick={() => setManage(a)}
                    >
                      Manage
                    </button>
                    <button
                      type="button"
                      data-testid="edit-asset-row"
                      aria-label={`Edit asset ${a.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      data-testid="delete-asset-row"
                      aria-label={`Delete asset ${a.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setDeleting(a)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
      <Pagination {...assetsPage} testid="assets-pagination" />

      {createOpen && <AssetFormModal existing={null} onClose={() => setCreateOpen(false)} />}
      {editing && <AssetFormModal existing={editing} onClose={() => setEditing(null)} />}
      {manage && (
        <AssetModal
          asset={manage}
          onClose={() => setManage(null)}
          onEdit={() => {
            setEditing(manage)
            setManage(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete asset"
          testid="asset-delete-dialog"
          confirmLabel="Delete asset"
          loading={del.isPending}
          onClose={() => setDeleting(null)}
          message={
            <p>
              Delete <span className="font-semibold text-slate-900">{deleting.name}</span> and its
              assignment history? This cannot be undone.
            </p>
          }
          onConfirm={() =>
            del.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('Asset deleted')
                setDeleting(null)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
    </div>
  )
}

function AssetFormModal({ existing, onClose }: { existing: Asset | null; onClose: () => void }) {
  const create = useCreateAsset()
  const update = useUpdateAsset()
  const toast = useToast()
  const assetTypes = useMasterOptions('asset_types', FALLBACK_ASSET_TYPES)
  const [assetType, setAssetType] = useState(existing?.asset_type ?? assetTypes.options[0]?.code ?? 'laptop')
  const [name, setName] = useState(existing?.name ?? '')
  const [serial, setSerial] = useState(existing?.serial ?? '')
  const [batchNo, setBatchNo] = useState(existing?.batch_no ?? '')
  const [condition, setCondition] = useState(existing?.condition ?? 'good')
  const pending = create.isPending || update.isPending
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit asset' : 'New asset'}
      testid={existing ? 'asset-modal-edit' : 'asset-modal-create'}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const input = { assetType, name: name.trim(), serial: serial.trim() || undefined, batchNo: batchNo.trim() || undefined }
          const done = {
            onSuccess: () => { toast.success(existing ? 'Asset updated' : 'Asset created'); onClose() },
            onError: (err: unknown) => toast.error('Failed', (err as Error).message),
          }
          if (existing) update.mutate({ id: existing.id, ...input, condition }, done)
          else create.mutate(input, done)
        }}
      >
        <div className={existing ? 'grid grid-cols-2 gap-3' : undefined}>
          <div>
            <Label htmlFor="as-type">Type</Label>
            <Select id="as-type" data-testid="asset-type" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
              {assetTypes.options.map((t) => (<option key={t.code} value={t.code}>{t.name}</option>))}
              {existing && !assetTypes.options.some((t) => t.code === existing.asset_type) && (
                <option value={existing.asset_type}>{assetTypes.labelOf(existing.asset_type)}</option>
              )}
            </Select>
          </div>
          {existing && (
            <div>
              <Label htmlFor="as-condition">Condition</Label>
              <Select id="as-condition" data-testid="asset-condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
                {ASSET_CONDITIONS.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}
                {!ASSET_CONDITIONS.some((c) => c.code === existing.condition) && (
                  <option value={existing.condition}>{conditionLabel(existing.condition)}</option>
                )}
              </Select>
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="as-name">Name</Label>
          <Input id="as-name" data-testid="asset-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="as-serial">Serial no</Label>
            <Input id="as-serial" data-testid="asset-serial" value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="as-batch">Batch no</Label>
            <Input id="as-batch" data-testid="asset-batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" data-testid={existing ? 'save-asset' : 'create-asset'} loading={pending}>
            {existing ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function AssetModal({ asset, onClose, onEdit }: { asset: Asset; onClose: () => void; onEdit: () => void }) {
  const { data: users = [] } = useUsers()
  const { data: history = [] } = useAssetAssignments(asset.id)
  const assign = useAssignAsset()
  const transfer = useTransferAsset()
  const ret = useReturnAsset()
  const del = useDeleteAsset()
  const toast = useToast()
  const assetTypes = useMasterOptions('asset_types', FALLBACK_ASSET_TYPES)
  const [employeeId, setEmployeeId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const current = history.find((h) => !h.returned_at)
  const targetId = employeeId || users[0]?.id || ''

  return (
    <Modal open onClose={onClose} title={asset.name} testid="asset-modal">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
          <span>Type: <span className="font-medium text-slate-700">{assetTypes.labelOf(asset.asset_type)}</span></span>
          <span>Serial no: <span className="font-mono font-medium text-slate-700">{asset.serial || '—'}</span></span>
          <span>Batch no: <span className="font-mono font-medium text-slate-700">{asset.batch_no || '—'}</span></span>
          <span>Condition: <span className="font-medium text-slate-700" data-testid="asset-condition-value">{conditionLabel(asset.condition)}</span></span>
        </div>
        <p className="text-sm" data-testid="current-holder">
          Current holder: <strong>{current?.assignee?.full_name ?? 'Unassigned'}</strong>
        </p>

        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <div>
            <Label className="text-xs">Employee</Label>
            <Select data-testid="asset-employee" value={targetId} onChange={(e) => setEmployeeId(e.target.value)} className="w-48">
              {users.map((u) => (<option key={u.id} value={u.id}>{u.full_name || u.email}</option>))}
            </Select>
          </div>
          {!current ? (
            <Button size="sm" data-testid="assign-asset" loading={assign.isPending}
              onClick={() => assign.mutate({ assetId: asset.id, assigneeId: targetId }, { onSuccess: () => toast.success('Assigned'), onError: (e) => toast.error('Failed', (e as Error).message) })}>
              Assign
            </Button>
          ) : (
            <>
              <Button size="sm" data-testid="transfer-asset" loading={transfer.isPending}
                onClick={() => transfer.mutate({ assetId: asset.id, assigneeId: targetId }, { onSuccess: () => toast.success('Transferred'), onError: (e) => toast.error('Failed', (e as Error).message) })}>
                Transfer
              </Button>
              <Button size="sm" variant="outline" data-testid="return-asset" loading={ret.isPending}
                onClick={() => ret.mutate({ assetId: asset.id }, { onSuccess: () => toast.success('Returned') })}>
                Return
              </Button>
            </>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Assignment history</h3>
          <ul className="space-y-1" data-testid="asset-history">
            {history.length === 0 && <li className="text-sm text-slate-500">No history yet.</li>}
            {history.map((h) => (
              <li key={h.id} data-testid="assignment-row" className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="font-medium">{h.assignee?.full_name ?? 'Unknown'}</span>
                <span className="text-xs text-slate-500">
                  {new Date(h.assigned_at).toLocaleDateString()} →{' '}
                  {h.returned_at ? new Date(h.returned_at).toLocaleDateString() : 'current'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          {!confirmDelete ? (
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" data-testid="edit-asset" onClick={onEdit}>
                <Pencil className="size-4" /> Edit
              </Button>
              <Button size="sm" variant="danger" data-testid="delete-asset" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete asset
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-slate-600">
              Delete <strong>{asset.name}</strong> and its history?
              <Button
                size="sm"
                variant="danger"
                data-testid="confirm-delete-asset"
                loading={del.isPending}
                onClick={() =>
                  del.mutate(asset.id, {
                    onSuccess: () => {
                      toast.success('Asset deleted')
                      onClose()
                    },
                    onError: (e) => toast.error('Delete failed', (e as Error).message),
                  })
                }
              >
                Yes, delete
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </span>
          )}
          <Button variant="outline" data-testid="close-asset" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}
