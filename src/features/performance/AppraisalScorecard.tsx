import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import {
  metricLabel,
  useAppraisalScorecard,
  useSaveAppraisalScores,
  type AppraisalItemScore,
  type ScoringRole,
} from './hooks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/toast-context'
import { cn } from '@/lib/cn'

const ROLES: { role: ScoringRole; label: string }[] = [
  { role: 'employee', label: 'Employee' },
  { role: 'manager', label: 'Manager' },
  { role: 'hr', label: 'HR' },
]

type Draft = { value: string; remarks: string }
const keyOf = (id: string, role: ScoringRole) => `${id}:${role}`
const stored = (row: AppraisalItemScore, role: ScoringRole): Draft => ({
  value: row[`${role}_score`] == null ? '' : String(row[`${role}_score`]),
  remarks: row[`${role}_remarks`] ?? '',
})

/**
 * KRA / KPI scorecard for one appraisal (client sheet: "Entry from Appraisal").
 * Every item is scored out of 10 by four parties. System is read-only and
 * shows the logic it used; the other columns are editable only by the people
 * allowed to score in that role — the server enforces it too.
 */
export function AppraisalScorecard({ appraisalId }: { appraisalId: string }) {
  const { data, isLoading, error } = useAppraisalScorecard(appraisalId)
  const save = useSaveAppraisalScores(appraisalId)
  const toast = useToast()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const roles = data?.roles ?? []

  const cell = (row: AppraisalItemScore, role: ScoringRole) =>
    drafts[keyOf(row.id, role)] ?? stored(row, role)

  const changes = useMemo(() => {
    const out: Array<{ scoreId: string; role: ScoringRole; value: number | null; remarks: string }> =
      []
    for (const row of rows) {
      for (const { role } of ROLES) {
        const draft = drafts[keyOf(row.id, role)]
        if (!draft) continue
        const before = stored(row, role)
        if (draft.value === before.value && draft.remarks === before.remarks) continue
        out.push({
          scoreId: row.id,
          role,
          value: draft.value.trim() === '' ? null : Number(draft.value),
          remarks: draft.remarks,
        })
      }
    }
    return out
  }, [rows, drafts])

  const invalid = changes.some(
    (c) => c.value != null && (Number.isNaN(c.value) || c.value < 0 || c.value > 10),
  )

  if (isLoading) return <p className="text-sm text-slate-500">Loading scorecard…</p>
  if (error)
    return (
      <p className="text-sm text-red-600" data-testid="scorecard-error">
        Could not load the scorecard: {(error as Error).message}
      </p>
    )
  if (rows.length === 0)
    return (
      <p className="text-sm text-slate-500" data-testid="scorecard-empty">
        No KRA or KPI is assigned to this employee yet. Assign a designation (or pick KRAs / KPIs)
        in Users, then reopen this scorecard.
      </p>
    )

  return (
    <div data-testid="appraisal-scorecard" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Scores are out of 10.{' '}
          {roles.length ? (
            <>
              You can fill:{' '}
              {roles.map((r) => (
                <Badge key={r} tone="brand" className="mr-1 capitalize">
                  {r === 'hr' ? 'HR' : r}
                </Badge>
              ))}
            </>
          ) : (
            'View only.'
          )}
        </p>
        {roles.length > 0 && (
          <Button
            size="sm"
            data-testid="scorecard-save"
            disabled={changes.length === 0 || invalid}
            loading={save.isPending}
            onClick={() =>
              save.mutate(changes, {
                onSuccess: () => {
                  toast.success('Scores saved')
                  setDrafts({})
                },
                onError: (err) => toast.error('Save failed', (err as Error).message),
              })
            }
          >
            <Save className="size-4" /> Save{changes.length ? ` (${changes.length})` : ''}
          </Button>
        )}
      </div>
      {invalid && <p className="text-xs text-red-600">Each score must be between 0 and 10.</p>}

      {(['kra', 'kpi'] as const).map((kind) => {
        const list = rows.filter((r) => r.kind === kind)
        if (list.length === 0) return null
        return (
          <section key={kind} data-testid={`scorecard-${kind}`}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-600">
              {kind === 'kra' ? 'KRA — Key Result Areas' : 'KPI — Key Performance Indicators'}
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="w-10 px-3 py-2">#</th>
                    <th className="px-3 py-2">{kind.toUpperCase()}</th>
                    <th className="w-64 px-3 py-2">System</th>
                    {ROLES.map(({ role, label }) => (
                      <th key={role} className="w-52 px-3 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((row, i) => (
                    <tr key={row.id} data-testid="scorecard-row" className="align-top">
                      <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {row.item_name}
                        {row.system_metric && (
                          <div className="text-xs font-normal text-slate-400">
                            System logic: {metricLabel(row.system_metric)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2" data-testid="scorecard-system">
                        {row.system_metric ? (
                          <>
                            <p className="font-semibold text-slate-900">
                              {row.system_score == null ? '—' : `${row.system_score} / 10`}
                            </p>
                            <p className="mt-0.5 text-xs leading-snug text-slate-500">
                              {row.system_remarks}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">
                            No system logic — scored by people only.
                          </p>
                        )}
                      </td>
                      {ROLES.map(({ role, label }) => {
                        const editable = roles.includes(role)
                        const value = cell(row, role)
                        if (!editable) {
                          return (
                            <td key={role} className="px-3 py-2">
                              <p className="font-semibold text-slate-900">
                                {value.value === '' ? '—' : `${value.value} / 10`}
                              </p>
                              {value.remarks && (
                                <p className="mt-0.5 text-xs leading-snug whitespace-pre-wrap text-slate-500">
                                  {value.remarks}
                                </p>
                              )}
                            </td>
                          )
                        }
                        const set = (patch: Partial<Draft>) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [keyOf(row.id, role)]: { ...value, ...patch },
                          }))
                        return (
                          <td key={role} className="space-y-1 px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={0.5}
                              inputMode="decimal"
                              aria-label={`${label} score for ${row.item_name}`}
                              data-testid={`score-${role}`}
                              placeholder="0 – 10"
                              value={value.value}
                              onChange={(e) => set({ value: e.target.value })}
                              className={cn(
                                'h-8 w-24 rounded-md border border-slate-200 px-2 text-sm',
                                value.value !== '' &&
                                  (Number(value.value) < 0 || Number(value.value) > 10) &&
                                  'border-red-400',
                              )}
                            />
                            <textarea
                              rows={2}
                              aria-label={`${label} remarks for ${row.item_name}`}
                              data-testid={`remarks-${role}`}
                              placeholder="Remarks"
                              value={value.remarks}
                              onChange={(e) => set({ remarks: e.target.value })}
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold text-slate-800">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">Average</td>
                    <td className="px-3 py-2">{average(list.map((r) => r.system_score))}</td>
                    {ROLES.map(({ role }) => (
                      <td key={role} className="px-3 py-2">
                        {average(
                          list.map((r) => {
                            const v = cell(r, role).value
                            return v === '' ? null : Number(v)
                          }),
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function average(values: Array<number | null>) {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v))
  if (nums.length === 0) return '—'
  return `${(nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(1)} / 10`
}

export function ScorecardModal({
  appraisalId,
  title,
  onClose,
}: {
  appraisalId: string
  title: string
  onClose: () => void
}) {
  return (
    <Modal open onClose={onClose} title={title} testid="scorecard-modal" size="wide">
      <AppraisalScorecard appraisalId={appraisalId} />
    </Modal>
  )
}
