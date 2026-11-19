import { useEffect, useRef, useState } from 'react'

/**
 * useState that transparently persists to localStorage under `key`. The value
 * must be JSON-serialisable. Initial render returns whatever is in storage
 * (or `fallback` when nothing is stored), so a refresh picks the choice back
 * up. A localStorage write failure (private mode / full storage) is treated
 * as an in-memory fallback — reads just stop persisting, they don't throw.
 */
export function usePersistedState<T>(key: string, fallback: T) {
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return fallback
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  })

  // Rehydrate when the key changes (e.g. the page uses a key suffix).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) {
        setValue(fallbackRef.current)
        return
      }
      setValue(JSON.parse(raw) as T)
    } catch {
      setValue(fallbackRef.current)
    }
  }, [key])

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode / full storage — in-memory only */
    }
  }, [key, value])

  return [value, setValue] as const
}
