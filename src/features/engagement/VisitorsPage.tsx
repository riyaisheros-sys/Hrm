import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRegisterVisitor, useVisitors } from './hooks'
import { MeetingsSection } from './MeetingsSection'
import { usePeople } from '@/lib/people'
import { FALLBACK_VISIT_PURPOSES, useMasterOptions } from '@/lib/masterOptions'
import { PassCode, VisitorActions } from './VisitorActions'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import { SortFilterTh } from '@/components/ui/SortFilterTh'
import { useTableControls } from '@/lib/useTableControls'
import { EmptyState } from '@/components/ui/EmptyState'

export function VisitorsPage() {
  const { data: visitors = [] } = useVisitors()
  const purposes = useMasterOptions('visit_purposes', FALLBACK_VISIT_PURPOSES)
  const controls = useTableControls(visitors, {
    visitor: (v) => `${v.name} ${v.company ?? ''}`,
    host: (v) => (v.host_id ? nameById.get(v.host_id) : ''),
    purpose: (v) => purposes.labelOf(v.purpose),
    date: (v) => v.visit_date,
    pass: (v) => v.pass_code ?? 'removed',
  })
  const visitorsPage = usePagination(controls.rows, 25, controls.stateKey)
  const { data: users = [] } = usePeople()
  const register = useRegisterVisitor()
  const toast = useToast()
  const nameById = new Map(users.map((u) => [u.id, u.full_name || u.email]))

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [hostId, setHostId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [visitDate, setVisitDate] = useState('')

  return (
    <div data-testid="visitors-page">
      <PageHeader title="Visitors & Meetings" description="Register visitors, issue passes, and manage internal meetings." />

      <Card className="mb-4">
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              register.mutate(
                {
                  name: name.trim(),
                  company,
                  purpose: purpose || purposes.options[0]?.code || '',
                  hostId: hostId || users[0]?.id || null,
                  visitDate,
                },
                { onSuccess: () => { toast.success('Visitor registered'); setName(''); setCompany('') }, onError: (err) => toast.error('Failed', (err as Error).message) },
              )
            }}
          >
            <div>
              <Label className="text-xs">Visitor name</Label>
              <Input data-testid="visitor-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
            </div>
            <div>
              <Label className="text-xs">Company</Label>
              <Input data-testid="visitor-company" value={company} onChange={(e) => setCompany(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">Purpose</Label>
              <Select data-testid="visitor-purpose" value={purpose || purposes.options[0]?.code || ''} onChange={(e) => setPurpose(e.target.value)} className="w-44">
                {purposes.options.map((p) => (<option key={p.code} value={p.code}>{p.name}</option>))}
              </Select>
            </div>
            <div>
              <Label className="text-xs">Host</Label>
              <Select data-testid="visitor-host" value={hostId || users[0]?.id || ''} onChange={(e) => setHostId(e.target.value)} className="w-44">
                {users.filter((u) => u.status === 'active').map((u) => (<option key={u.id} value={u.id}>{u.full_name || u.email}</option>))}
              </Select>
            </div>
            <div>
              <Label className="text-xs">Visit date</Label>
              <Input data-testid="visitor-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required className="w-40" />
            </div>
            <Button type="submit" data-testid="register-visitor" loading={register.isPending}>
              <Plus className="size-4" /> Register
            </Button>
          </form>
        </CardBody>
      </Card>

      {visitors.length === 0 ? (
        <EmptyState title="No visitors yet" testid="visitors-empty" />
      ) : (
        <Table data-testid="visitors-table">
          <Thead>
            <tr>
              <SortFilterTh controls={controls} k="visitor">Visitor</SortFilterTh>
              <SortFilterTh controls={controls} k="host">Host</SortFilterTh>
              <SortFilterTh controls={controls} k="purpose">Purpose</SortFilterTh>
              <SortFilterTh controls={controls} k="date">Date</SortFilterTh>
              <SortFilterTh controls={controls} k="pass">Pass code</SortFilterTh>
              <Th className="text-right">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {visitorsPage.pagedItems.map((v) => (
              <tr key={v.id} data-testid="visitor-row">
                <Td className="font-medium text-slate-900">
                  {v.name}
                  {v.company && <div className="text-xs font-normal text-slate-500">{v.company}</div>}
                </Td>
                <Td>{v.host_id ? (nameById.get(v.host_id) ?? '—') : '—'}</Td>
                <Td className="text-slate-600">{v.purpose ? purposes.labelOf(v.purpose) : '—'}</Td>
                <Td>{v.visit_date}</Td>
                <Td><PassCode code={v.pass_code} testid="pass-code" /></Td>
                <Td>
                  <VisitorActions
                    visitor={v}
                    hostName={v.host_id ? nameById.get(v.host_id) : undefined}
                    purposeLabel={v.purpose ? purposes.labelOf(v.purpose) : undefined}
                    allowHostChange
                  />
                </Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
      <Pagination {...visitorsPage} testid="visitors-pagination" />

      <MeetingsSection />
    </div>
  )
}
