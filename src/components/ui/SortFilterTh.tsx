import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Th } from './Table'
import type { TableControls } from '@/lib/useTableControls'

/**
 * Table heading with click-to-sort (asc → desc → off) and a small funnel
 * that opens a "contains" filter for that column. Pair with useTableControls.
 */
export function SortFilterTh<T>({
  controls,
  k,
  children,
  className,
  style,
  filterable = true,
}: {
  controls: TableControls<T>
  /** Column key — must exist in the accessors passed to useTableControls. */
  k: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  filterable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dir = controls.sort?.key === k ? controls.sort.dir : null
  const filter = controls.filters[k] ?? ''

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <Th className={className} style={style}>
      <div ref={ref} className="relative inline-flex items-center gap-1">
        <button
          type="button"
          data-testid={`sort-${k}`}
          onClick={() => controls.toggleSort(k)}
          title="Sort"
          className="inline-flex items-center gap-1 uppercase tracking-wide hover:opacity-75"
        >
          {children}
          {dir === 'asc' ? (
            <ArrowUp className="size-3" />
          ) : dir === 'desc' ? (
            <ArrowDown className="size-3" />
          ) : (
            <ArrowUpDown className="size-3 opacity-40" />
          )}
        </button>
        {filterable && (
          <button
            type="button"
            data-testid={`filter-${k}`}
            aria-label="Filter this column"
            title={filter ? `Filter: ${filter}` : 'Filter this column'}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'rounded p-0.5',
              // Opacity, not a fixed grey, so the icon reads on any heading colour.
              filter ? 'bg-white text-brand-600' : 'opacity-50 hover:opacity-100',
            )}
          >
            <Filter className="size-3" />
          </button>
        )}
        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded-md border border-slate-200 bg-white p-2 text-slate-700 shadow-lg">
            <input
              ref={inputRef}
              data-testid={`filter-input-${k}`}
              value={filter}
              onChange={(e) => controls.setFilter(k, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setOpen(false)
              }}
              placeholder="Contains…"
              className="h-8 w-full rounded border border-slate-200 px-2 text-xs font-normal normal-case tracking-normal text-slate-700"
            />
            {filter && (
              <button
                type="button"
                onClick={() => {
                  controls.setFilter(k, '')
                  setOpen(false)
                }}
                className="mt-1 text-[11px] font-normal normal-case tracking-normal text-slate-500 hover:text-slate-800"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>
    </Th>
  )
}
