import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    // The table scrolls inside its own box (both axes) so the heading row can
    // stay pinned at the top while rows scroll — on every table in the app.
    <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  )
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">{children}</thead>
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'sticky top-0 z-10 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide shadow-[inset_0_-1px_0_#e2e8f0]',
        className,
      )}
      {...props}
    />
  )
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-2.5 align-middle text-slate-700', className)} {...props} />
}
