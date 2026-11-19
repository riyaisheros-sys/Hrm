import { useEffect, useMemo, useState } from 'react'

/**
 * Generic list pagination. Pass the fully-filtered array + an optional reset
 * key that changes whenever the filter changes (so the page bounces back to
 * 1 on a new query). Returns the window you render + the controls you wire
 * to <Pagination>.
 */
export function usePagination<T>(items: T[], pageSize = 25, resetKey?: unknown) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  // Clamp if the list shrinks below current page.
  useEffect(() => {
    if (page > totalPages - 1) setPage(0)
  }, [page, totalPages])

  // Reset to first page on filter change.
  useEffect(() => {
    setPage(0)
  }, [resetKey])

  const pageStart = page * pageSize
  const pageEnd = Math.min(pageStart + pageSize, items.length)
  const pagedItems = useMemo(
    () => items.slice(pageStart, pageEnd),
    [items, pageStart, pageEnd],
  )

  return {
    page,
    setPage,
    pagedItems,
    totalPages,
    pageStart,
    pageEnd,
    totalItems: items.length,
    pageSize,
  }
}
