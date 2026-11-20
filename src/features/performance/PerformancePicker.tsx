import { useMemo } from 'react'
import {
  metricLabel,
  useDesignationItems,
  useDesignations,
  usePerformanceItems,
  type ItemKind,
} from './hooks'
import { useDepartments } from '@/features/admin/hierarchy/hooks'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'

/**
 * Designation + KRA / KPI picker for the user form (client sheet: "User →
 * Designation → Default KRA / KPI, further editable for addition & deletion").
 * Choosing a designation loads its defaults; the ticks below can then be
 * changed for this one employee.
 */
export function PerformancePicker({
  departmentId,
  designationId,
  selected,
  onDesignationChange,
  onSelectedChange,
  idPrefix,
}: {
  departmentId: string
  designationId: string
  selected: Set<string>
  onDesignationChange: (designationId: string, defaults: Set<string>) => void
  onSelectedChange: (next: Set<string>) => void
  idPrefix: string
}) {
  const { data: departments = [] } = useDepartments()
  const { data: designations = [] } = useDesignations()
  const { data: defaults = new Map<string, Set<string>>() } = useDesignationItems()
  const { data: items = [] } = usePerformanceItems()
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments])

  // Show the chosen department's designations; with no department, show all.
  const options = designations.filter(
    (d) => d.is_active && (!departmentId || d.department_id === departmentId || d.id === designationId),
  )
  const designationDefaults = designationId ? (defaults.get(designationId) ?? new Set()) : new Set()

  const column = (kind: ItemKind) => {
    const list = items.filter((i) => i.kind === kind && (i.is_active || selected.has(i.id)))
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {kind.toUpperCase()}
        </p>
        {list.length === 0 ? (
          <p className="text-xs text-slate-400">
            Nothing in the {kind.toUpperCase()} master yet — add some in KRA / KPI Master.
          </p>
        ) : (
          <ul
            className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 p-2"
            data-testid={`${idPrefix}-${kind}-list`}
          >
            {list.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="accent-brand-600 mt-0.5"
                    checked={selected.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(selected)
                      if (e.target.checked) next.add(item.id)
                      else next.delete(item.id)
                      onSelectedChange(next)
                    }}
                  />
                  <span className="text-sm text-slate-700">
                    {item.name}
                    {designationDefaults.has(item.id) && (
                      <span className="ml-1 text-[11px] text-slate-400">default</span>
                    )}
                    {item.system_metric && (
                      <span className="ml-1 text-[11px] text-slate-400">
                        · system: {metricLabel(item.system_metric)}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3" data-testid={`${idPrefix}-performance`}>
      <div className="mb-3">
        <Label htmlFor={`${idPrefix}-designation`}>Designation</Label>
        <Select
          id={`${idPrefix}-designation`}
          data-testid={`${idPrefix}-designation-select`}
          value={designationId}
          onChange={(e) => {
            const id = e.target.value
            onDesignationChange(id, new Set(id ? (defaults.get(id) ?? []) : []))
          }}
        >
          <option value="">— None —</option>
          {options.map((d) => (
            <option key={d.id} value={d.id}>
              {departmentId ? d.name : `${deptName.get(d.department_id) ?? ''} · ${d.name}`}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-slate-400">
          Choosing a designation loads its default KRAs and KPIs below. Add or remove any for this
          employee.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {column('kra')}
        {column('kpi')}
      </div>
    </div>
  )
}
