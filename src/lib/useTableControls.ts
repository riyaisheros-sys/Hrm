import { useMemo, useRef, useState } from 'react'

/**
 * Click-to-sort and per-column text filter for any list table.
 *
 * `accessors` maps a column key to the plain value used for sorting and
 * filtering (what the user sees in that cell). Pair with <SortFilterTh>.
 * The returned `rows` are filtered then sorted; feed them to pagination.
 */
export type Accessors<T> = Record<string, (row: T) => string | number | null | undefined>

export interface TableControls<T> {
  rows: T[]
  sort: { key: string; dir: 'asc' | 'desc' } | null
  filters: Record<string, string>
  toggleSort: (key: string) => void
  setFilter: (key: string, value: string) => void
  clear: () => void
  /** Changes whenever sort or filters change — pass to usePagination's resetKey. */
  stateKey: string
  active: boolean
}

export function useTableControls<T>(rows: T[], accessors: Accessors<T>): TableControls<T> {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  // Accessors are usually an inline object; keep the latest without making
  // every render recompute the sorted list.
  const accessorsRef = useRef(accessors)
  accessorsRef.current = accessors

  const result = useMemo(() => {
    const acc = accessorsRef.current
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim() !== '')
    let out = rows
    if (activeFilters.length) {
      out = out.filter((row) =>
        activeFilters.every(([key, needle]) => {
          const get = acc[key]
          if (!get) return true
          return String(get(row) ?? '')
            .toLowerCase()
            .includes(needle.trim().toLowerCase())
        }),
      )
    }
    if (sort && acc[sort.key]) {
      const get = acc[sort.key]
      const factor = sort.dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => {
        const av = get(a)
        const bv = get(b)
        const aEmpty = av == null || av === ''
        const bEmpty = bv == null || bv === ''
        if (aEmpty && bEmpty) return 0
        if (aEmpty) return 1 // blanks always last
        if (bEmpty) return -1
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
        return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor
      })
    }
    return out
  }, [rows, sort, filters])

  return {
    rows: result,
    sort,
    filters,
    // asc → desc → off
    toggleSort: (key) =>
      setSort((prev) =>
        prev?.key !== key
          ? { key, dir: 'asc' }
          : prev.dir === 'asc'
            ? { key, dir: 'desc' }
            : null,
      ),
    setFilter: (key, value) => setFilters((prev) => ({ ...prev, [key]: value })),
    clear: () => {
      setSort(null)
      setFilters({})
    },
    stateKey: JSON.stringify([sort, filters]),
    active: !!sort || Object.values(filters).some((v) => v.trim() !== ''),
  }
}
