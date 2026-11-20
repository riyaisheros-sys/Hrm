import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Columns3, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ColumnDef } from '@/lib/useColumnConfig'

const SWATCHES = [
  '', // default (no tint)
  '#1f2937', // slate-800 (default dark)
  '#1d4ed8', // blue-700
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#0891b2', // cyan-600
]

/**
 * Inline "Window 2 · Display headings" style column picker. Every column
 * renders as a checkbox chip; clicking the small swatch beside the label
 * opens a colour picker so the admin can tint that heading. Items can also
 * be reordered with the small ↑ / ↓ arrows that appear on hover.
 *
 * Pair with `useColumnConfig` (which persists both visibility and colour).
 */
export function ColumnChips({
  config,
  title = 'Display headings',
  testid = 'column-chips',
  className,
}: {
  config: {
    pref: { order: string[]; hidden: string[]; colors?: Record<string, string> }
    all: ColumnDef[]
    toggle: (id: string) => void
    move: (id: string, dir: -1 | 1) => void
    setColor: (id: string, color: string | null) => void
    colorOf: (id: string) => string | undefined
    reset: () => void
  }
  title?: string
  testid?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // The panel normally hangs from the button's right edge. When the button
  // sits near the left of the content area that would push the panel under
  // the sidebar, so in that case it hangs from the left edge instead.
  const [alignLeft, setAlignLeft] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const byId = new Map(config.all.map((c) => [c.id, c]))
  const ordered = config.pref.order
    .map((id) => byId.get(id))
    .filter((c): c is ColumnDef => !!c)
  const hiddenCount = config.pref.hidden.length
  const shownCount = config.all.length - hiddenCount

  return (
    <div
      ref={panelRef}
      data-testid={testid}
      className={cn('relative inline-block', className)}
    >
      <button
        type="button"
        data-testid={`${testid}-button`}
        onClick={() => {
          const rect = panelRef.current?.getBoundingClientRect()
          const main = document.querySelector('[data-testid="app-main"]')?.getBoundingClientRect()
          const panelWidth = Math.min(window.innerWidth * 0.9, 512)
          if (rect) setAlignLeft(rect.right - panelWidth < (main?.left ?? 0) + 8)
          setOpen((v) => !v)
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Columns3 className="size-4" />
        {title}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          {shownCount}/{config.all.length}
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {!open ? null : (
      <div
        data-testid={`${testid}-panel`}
        className={cn(
          'absolute z-30 mt-2 w-[min(90vw,32rem)] rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-lg',
          alignLeft ? 'left-0' : 'right-0',
        )}
      >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <button
          type="button"
          onClick={() => config.reset()}
          data-testid={`${testid}-reset`}
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
          title="Reset to default"
        >
          <RotateCcw className="size-3" /> Reset
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto flex flex-wrap gap-x-2 gap-y-2">
        {ordered.map((c, i) => {
          const visible = !config.pref.hidden.includes(c.id)
          const color = config.colorOf(c.id)
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1"
              data-testid={`${testid}-item-${c.id}`}
            >
              <input
                id={`${testid}-${c.id}`}
                type="checkbox"
                className="accent-brand-600"
                checked={visible}
                onChange={() => config.toggle(c.id)}
              />
              <SwatchPicker
                value={color}
                onChange={(v) => config.setColor(c.id, v)}
                testid={`${testid}-swatch-${c.id}`}
              />
              <label
                htmlFor={`${testid}-${c.id}`}
                className={cn(
                  'cursor-pointer text-sm',
                  !visible && 'text-slate-400 line-through',
                )}
                style={visible && color ? { color } : undefined}
              >
                {c.label}
              </label>
              <div className="ml-0.5 inline-flex overflow-hidden rounded border border-slate-200 bg-white">
                <button
                  type="button"
                  aria-label={`Move ${c.label} left`}
                  disabled={i === 0}
                  onClick={() => config.move(c.id, -1)}
                  className="px-0.5 text-slate-400 enabled:hover:bg-slate-100 enabled:hover:text-slate-700 disabled:opacity-25"
                  title="Move left"
                  data-testid={`${testid}-up-${c.id}`}
                >
                  <ArrowUp className="size-3" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${c.label} right`}
                  disabled={i === ordered.length - 1}
                  onClick={() => config.move(c.id, 1)}
                  className="border-l border-slate-200 px-0.5 text-slate-400 enabled:hover:bg-slate-100 enabled:hover:text-slate-700 disabled:opacity-25"
                  title="Move right"
                  data-testid={`${testid}-down-${c.id}`}
                >
                  <ArrowDown className="size-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      </div>
      )}
    </div>
  )
}

function SwatchPicker({
  value,
  onChange,
  testid,
}: {
  value: string | undefined
  onChange: (next: string | null) => void
  testid: string
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid={testid}
        aria-label="Heading colour"
        onClick={() => setOpen((v) => !v)}
        className="size-2.5 rounded-full border border-slate-300 shadow-sm"
        style={{
          background: value || '#cbd5e1', // slate-300 so default looks like a neutral dot, not another checkbox
        }}
        title={value ? `Heading colour: ${value}` : 'Pick heading colour'}
      />
      {open && (
        <div
          data-testid={`${testid}-panel`}
          className="absolute left-0 top-5 z-40 flex gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-md"
        >
          {SWATCHES.map((hex) => (
            <button
              key={hex || 'default'}
              type="button"
              aria-label={hex ? `Set colour ${hex}` : 'Default colour'}
              onClick={() => {
                onChange(hex || null)
                setOpen(false)
              }}
              className={cn(
                'size-5 rounded-full border border-slate-300',
                value === hex && 'ring-brand-500 ring-2 ring-offset-1',
              )}
              style={{ background: hex || '#cbd5e1' }}
              title={hex || 'Default'}
            />
          ))}
          <input
            type="color"
            aria-label="Custom colour"
            value={value || '#1f2937'}
            onChange={(e) => onChange(e.target.value)}
            className="size-5 cursor-pointer rounded border border-slate-300 bg-white p-0"
            title="Custom colour"
          />
        </div>
      )}
    </div>
  )
}
