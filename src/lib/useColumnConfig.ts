import { useEffect, useMemo, useState } from 'react'

/**
 * Per-page column visibility + ordering, persisted to localStorage.
 * `all` is the master column list (id + label). The user reorders / hides via
 * ColumnConfigButton; the returned `visible` is `all` filtered + reordered
 * accordingly. First-time users see all columns in the default order.
 */
export interface ColumnDef {
  id: string
  label: string
}

export interface ColumnPref {
  order: string[]
  hidden: string[]
  /** Per-column header colour (hex or CSS colour). */
  colors?: Record<string, string>
}

function storageKey(page: string) {
  return `hrms-col-config:${page}`
}

function readLocalRaw(page: string): ColumnPref | null {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(page)) ?? 'null') as ColumnPref | null
    if (!raw) return null
    return {
      order: Array.isArray(raw.order) ? raw.order : [],
      hidden: Array.isArray(raw.hidden) ? raw.hidden : [],
      colors: raw.colors && typeof raw.colors === 'object' ? raw.colors : {},
    }
  } catch {
    return null
  }
}

function writeLocal(page: string, pref: ColumnPref) {
  try {
    localStorage.setItem(storageKey(page), JSON.stringify(pref))
  } catch {
    /* private mode / full storage — in-memory only */
  }
}

export function useColumnConfig(page: string, all: ColumnDef[]) {
  // Initial state: whatever is in storage (don't filter by `all` — the catalog
  // may not be loaded yet, filtering here would wipe saved order/hidden/colors).
  const [pref, setPref] = useState<ColumnPref>(() => {
    const raw = readLocalRaw(page)
    if (raw) return raw
    return { order: all.map((c) => c.id), hidden: [], colors: {} }
  })

  // When `page` changes (e.g. user switches report type), re-read storage so
  // each page keeps its own layout.
  useEffect(() => {
    const raw = readLocalRaw(page)
    setPref(
      raw ?? { order: all.map((c) => c.id), hidden: [], colors: {} },
    )
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once the catalog arrives, merge: drop ids no longer in the catalog and
  // append any brand-new ids to the end. Persist the merged shape so refresh
  // keeps the same layout.
  useEffect(() => {
    if (all.length === 0) return
    setPref((prev) => {
      const known = new Set(all.map((c) => c.id))
      const order = prev.order.filter((id) => known.has(id))
      let changed = order.length !== prev.order.length
      for (const c of all) {
        if (!order.includes(c.id)) {
          order.push(c.id)
          changed = true
        }
      }
      const hidden = prev.hidden.filter((id) => known.has(id))
      const hiddenChanged = hidden.length !== prev.hidden.length
      const colorsBefore = prev.colors ?? {}
      const colors: Record<string, string> = {}
      for (const [k, v] of Object.entries(colorsBefore)) {
        if (known.has(k) && typeof v === 'string') colors[k] = v
      }
      const colorsChanged = Object.keys(colors).length !== Object.keys(colorsBefore).length
      if (!changed && !hiddenChanged && !colorsChanged) return prev
      const next: ColumnPref = { order, hidden, colors }
      writeLocal(page, next)
      return next
    })
  }, [all, page])

  function save(next: ColumnPref) {
    setPref(next)
    writeLocal(page, next)
  }

  const visible = useMemo<ColumnDef[]>(() => {
    const byId = new Map(all.map((c) => [c.id, c]))
    return pref.order
      .filter((id) => !pref.hidden.includes(id))
      .map((id) => byId.get(id))
      .filter((c): c is ColumnDef => !!c)
  }, [all, pref])

  function toggle(id: string) {
    save({
      ...pref,
      hidden: pref.hidden.includes(id)
        ? pref.hidden.filter((x) => x !== id)
        : [...pref.hidden, id],
    })
  }

  function move(id: string, dir: -1 | 1) {
    const i = pref.order.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= pref.order.length) return
    const next = [...pref.order]
    ;[next[i], next[j]] = [next[j], next[i]]
    save({ ...pref, order: next })
  }

  function reset() {
    save({ order: all.map((c) => c.id), hidden: [], colors: {} })
  }

  function setColor(id: string, color: string | null) {
    const next = { ...(pref.colors ?? {}) }
    if (!color) delete next[id]
    else next[id] = color
    save({ ...pref, colors: next })
  }

  function colorOf(id: string): string | undefined {
    return pref.colors?.[id]
  }

  return { pref, visible, toggle, move, reset, setColor, colorOf, all }
}
