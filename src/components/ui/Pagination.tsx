/**
 * Pagination control that pairs with `usePagination`. Hidden automatically
 * when the list fits on one page (so small datasets stay clean).
 */
export function Pagination({
  page,
  setPage,
  totalPages,
  pageStart,
  pageEnd,
  totalItems,
  pageSize,
  testid = 'pagination',
}: {
  page: number
  setPage: (p: number) => void
  totalPages: number
  pageStart: number
  pageEnd: number
  totalItems: number
  pageSize: number
  testid?: string
}) {
  if (totalItems <= pageSize) return null

  return (
    <div
      data-testid={testid}
      className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"
    >
      <span>
        Showing <strong className="text-slate-700">{pageStart + 1}</strong>–
        <strong className="text-slate-700">{pageEnd}</strong> of{' '}
        <strong className="text-slate-700">{totalItems}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid={`${testid}-prev`}
          disabled={page === 0}
          onClick={() => setPage(Math.max(0, page - 1))}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="px-2">
          Page <strong className="text-slate-700">{page + 1}</strong> of{' '}
          <strong className="text-slate-700">{totalPages}</strong>
        </span>
        <button
          type="button"
          data-testid={`${testid}-next`}
          disabled={page >= totalPages - 1}
          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
