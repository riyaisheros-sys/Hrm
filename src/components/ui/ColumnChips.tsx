import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
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
  const byId = new Map(config.all.map((c) => [c.id, c]))
  const ordered = config.pref.order
    .map((id) => byId.get(id))
    .filter((c): c is ColumnDef => !!c)

  return (
    <div
      data-testid={testid}
      className={cn(
        'rounded-lg border border-slate-200 bg-slate-50 p-3',
        className,
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
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {ordered.map((c, i) => {
          const visible = !config.pref.hidden.includes(c.id)
          const color = config.colorOf(c.id)
          return (
            <div
              key={c.id}
              className="group flex items-center gap-1.5"
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
              <button
                type="button"
                aria-label={`Move ${c.label} up`}
                disabled={i === 0}
                onClick={() => config.move(c.id, -1)}
                className="rounded text-slate-300 opacity-0 enabled:hover:text-slate-700 group-hover:opacity-100 disabled:opacity-20"
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                type="button"
                aria-label={`Move ${c.label} down`}
                disabled={i === ordered.length - 1}
                onClick={() => config.move(c.id, 1)}
                className="rounded text-slate-300 opacity-0 enabled:hover:text-slate-700 group-hover:opacity-100 disabled:opacity-20"
              >
                <ArrowDown className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
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
        className="size-3.5 rounded-sm border border-slate-300"
        style={{
          background: value || 'linear-gradient(135deg, #fff 50%, #e2e8f0 50%)',
        }}
        title={value ? `Colour: ${value}` : 'Default colour'}
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
                'size-5 rounded-sm border border-slate-300',
                value === hex && 'ring-brand-500 ring-2 ring-offset-1',
              )}
              style={{
                background: hex || 'linear-gradient(135deg, #fff 50%, #e2e8f0 50%)',
              }}
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
