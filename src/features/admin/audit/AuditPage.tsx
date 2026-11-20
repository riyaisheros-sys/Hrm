import { useAuditLog, useActorMap } from './hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Table, Tbody, Td, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { SortFilterTh } from '@/components/ui/SortFilterTh'
import { useTableControls } from '@/lib/useTableControls'

const actionTone = {
  insert: 'green',
  update: 'amber',
  delete: 'red',
} as const

export function AuditPage() {
  const { data: entries = [], isLoading } = useAuditLog()
  const { data: actors } = useActorMap()
  const controls = useTableControls(entries, {
    when: (e) => e.created_at,
    actor: (e) => (e.actor_id ? (actors?.get(e.actor_id) ?? 'Unknown') : 'System'),
    action: (e) => e.action,
    entity: (e) => e.entity_type,
  })
  const pagination = usePagination(controls.rows, 25, controls.stateKey)

  return (
    <div data-testid="audit-page">
      <PageHeader
        title="Audit Log"
        description="Append-only trail of sensitive changes: who, what, and when."
      />

      {!isLoading && entries.length === 0 ? (
        <EmptyState title="No audit entries yet" testid="audit-empty" />
      ) : (
        <Table data-testid="audit-table">
          <Thead>
            <tr>
              <SortFilterTh controls={controls} k="when">When</SortFilterTh>
              <SortFilterTh controls={controls} k="actor">Actor</SortFilterTh>
              <SortFilterTh controls={controls} k="action">Action</SortFilterTh>
              <SortFilterTh controls={controls} k="entity">Entity</SortFilterTh>
            </tr>
          </Thead>
          <Tbody>
            {pagination.pagedItems.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-xs text-slate-500">
                  {new Date(e.created_at).toLocaleString()}
                </Td>
                <Td>{e.actor_id ? (actors?.get(e.actor_id) ?? 'Unknown') : 'System'}</Td>
                <Td>
                  <Badge tone={actionTone[e.action as keyof typeof actionTone] ?? 'slate'}>
                    {e.action}
                  </Badge>
                </Td>
                <Td className="font-medium text-slate-800">{e.entity_type}</Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
      <Pagination {...pagination} testid="audit-pagination" />
    </div>
  )
}
