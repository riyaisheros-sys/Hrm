import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMyVisitors, useRegisterVisitor } from './hooks'
import { MeetingsSection } from './MeetingsSection'
import { useAuth } from '@/features/auth/auth-context'
import { useToast } from '@/components/ui/toast-context'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Table, Tbody, Td, Th, Thead } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { FALLBACK_VISIT_PURPOSES, useMasterOptions } from '@/lib/masterOptions'
import { PassCode, VisitorActions } from './VisitorActions'

export function MyVisitorsPage() {
  const { user } = useAuth()
  const { data: visitors = [] } = useMyVisitors()
  const register = useRegisterVisitor()
  const toast = useToast()
  const purposes = useMasterOptions('visit_purposes', FALLBACK_VISIT_PURPOSES)

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [purpose, setPurpose] = useState('')
  const [visitDate, setVisitDate] = useState('')

  return (
    <div data-testid="my-visitors-page">
      <PageHeader
        title="Visitors & Meetings"
        description="Register the visitors you're expecting, and host or respond to internal meetings."
      />

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
                  hostId: user?.id ?? null,
                  visitDate,
                },
                {
                  onSuccess: () => {
                    toast.success('Visitor registered')
                    setName('')
                    setCompany('')
                    setPurpose('')
                  },
                  onError: (err) => toast.error('Failed', (err as Error).message),
                },
              )
            }}
          >
            <div>
              <Label className="text-xs">Visitor name</Label>
              <Input data-testid="my-visitor-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
            </div>
            <div>
              <Label className="text-xs">Company</Label>
              <Input data-testid="my-visitor-company" value={company} onChange={(e) => setCompany(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">Purpose</Label>
              <Select data-testid="my-visitor-purpose" value={purpose || purposes.options[0]?.code || ''} onChange={(e) => setPurpose(e.target.value)} className="w-44">
                {purposes.options.map((p) => (<option key={p.code} value={p.code}>{p.name}</option>))}
              </Select>
            </div>
            <div>
              <Label className="text-xs">Visit date</Label>
              <Input data-testid="my-visitor-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required className="w-40" />
            </div>
            <Button type="submit" data-testid="my-register-visitor" loading={register.isPending}>
              <Plus className="size-4" /> Register
            </Button>
          </form>
        </CardBody>
      </Card>

      {visitors.length === 0 ? (
        <EmptyState title="No visitors registered yet" testid="my-visitors-empty" />
      ) : (
        <Table data-testid="my-visitors-table">
          <Thead>
            <tr>
              <Th>Visitor</Th>
              <Th>Purpose</Th>
              <Th>Date</Th>
              <Th>Pass code</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {visitors.map((v) => (
              <tr key={v.id} data-testid="my-visitor-row">
                <Td className="font-medium text-slate-900">
                  {v.name}
                  {v.company && <div className="text-xs font-normal text-slate-500">{v.company}</div>}
                </Td>
                <Td className="text-slate-600">{v.purpose ? purposes.labelOf(v.purpose) : '—'}</Td>
                <Td>{v.visit_date}</Td>
                <Td>
                  <PassCode code={v.pass_code} testid="my-pass-code" />
                </Td>
                <Td>
                  <VisitorActions
                    visitor={v}
                    purposeLabel={v.purpose ? purposes.labelOf(v.purpose) : undefined}
                    testPrefix="my-"
                  />
                </Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}

      <MeetingsSection />
    </div>
  )
}
