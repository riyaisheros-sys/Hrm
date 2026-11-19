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
}

function storageKey(page: string) {
  return `hrms-col-config:${page}`
}

function readLocal(page: string, all: ColumnDef[]): ColumnPref {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(page)) ?? 'null') as ColumnPref | null
    if (!raw) throw new Error('empty')
    // Drop ids that no longer exist in the catalog (schema drift), and append
    // any new ids to the end so new columns are visible by default.
    const known = new Set(all.map((c) => c.id))
    const order = raw.order.filter((id) => known.has(id))
    for (const c of all) if (!order.includes(c.id)) order.push(c.id)
    const hidden = raw.hidden.filter((id) => known.has(id))
    return { order, hidden }
  } catch {
    return { order: all.map((c) => c.id), hidden: [] }
  }
}

export function useColumnConfig(page: string, all: ColumnDef[]) {
  const [pref, setPref] = useState<ColumnPref>(() => readLocal(page, all))

  // If the catalog grows (new columns added), re-sync the stored order so
  // new columns appear at the end without resetting user choices.
  useEffect(() => {
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
      return changed ? { order, hidden: prev.hidden.filter((id) => known.has(id)) } : prev
    })
  }, [all])

  function save(next: ColumnPref) {
    setPref(next)
    try {
      localStorage.setItem(storageKey(page), JSON.stringify(next))
    } catch {
      /* private mode / full storage — fine, in-memory only */
    }
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
    save({ order: all.map((c) => c.id), hidden: [] })
  }

  return { pref, visible, toggle, move, reset, all }
}
