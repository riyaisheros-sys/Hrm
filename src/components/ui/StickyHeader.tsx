import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Pins its children to the top of the scrolling <main> container so that
 * the page title + filters stay visible while the table below scrolls.
 * The negative side-margins extend the background to the edge of <main>'s
 * padding so content doesn't bleed around the sticky block.
 */
export function StickyHeader({
  children,
  className,
  testid,
}: {
  children: ReactNode
  className?: string
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      className={cn(
        'sticky top-0 z-20 -mx-4 bg-slate-50 px-4 pb-3 shadow-[0_6px_6px_-6px_rgba(0,0,0,0.08)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      {children}
    </div>
  )
}
