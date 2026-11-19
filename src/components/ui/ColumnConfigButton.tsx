import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Columns3, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ColumnDef } from '@/lib/useColumnConfig'

/**
 * Dropdown button that lets the user hide/show columns and reorder them
 * (↑ / ↓). Pair with `useColumnConfig`. The chosen layout is persisted per
 * page to localStorage by the hook.
 */
export function ColumnConfigButton({
  config,
  testid = 'column-config',
}: {
  config: {
    pref: { order: string[]; hidden: string[] }
    all: ColumnDef[]
    toggle: (id: string) => void
    move: (id: string, dir: -1 | 1) => void
    reset: () => void
  }
  testid?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const byId = new Map(config.all.map((c) => [c.id, c]))
  const orderedCols = config.pref.order
    .map((id) => byId.get(id))
    .filter((c): c is ColumnDef => !!c)
  const hiddenCount = config.pref.hidden.length

  return (
    <div className="relative" ref={ref} data-testid={testid}>
      <button
        type="button"
        data-testid={`${testid}-button`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <Columns3 className="size-3.5" /> Columns
        {hiddenCount > 0 && (
          <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
            {config.all.length - hiddenCount}/{config.all.length}
          </span>
        )}
      </button>
      {open && (
        <div
          data-testid={`${testid}-panel`}
          className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Columns · order &amp; visibility
            </h4>
            <button
              type="button"
              data-testid={`${testid}-reset`}
              onClick={() => config.reset()}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
              title="Reset to default"
            >
              <RotateCcw className="size-3" /> Reset
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {orderedCols.map((c, i) => {
              const visible = !config.pref.hidden.includes(c.id)
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50"
                  data-testid={`${testid}-item-${c.id}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Show ${c.label}`}
                    className="accent-brand-600"
                    checked={visible}
                    onChange={() => config.toggle(c.id)}
                  />
                  <span
                    className={cn('flex-1 text-sm', !visible && 'text-slate-400 line-through')}
                  >
                    {c.label}
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${c.label} up`}
                    disabled={i === 0}
                    onClick={() => config.move(c.id, -1)}
                    className="rounded p-1 text-slate-400 enabled:hover:bg-slate-100 enabled:hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${c.label} down`}
                    disabled={i === orderedCols.length - 1}
                    onClick={() => config.move(c.id, 1)}
                    className="rounded p-1 text-slate-400 enabled:hover:bg-slate-100 enabled:hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
