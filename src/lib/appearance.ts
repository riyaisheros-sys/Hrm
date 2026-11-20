import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Platform-wide table heading colour (set in Centralized Masters).
 *
 * The colour is stored once for the whole organisation in `app_appearance`.
 * Where that table is not there yet, it is kept in this browser only, so the
 * option still works. The last known colour is cached locally either way so
 * the page paints in the right colour before the network answers.
 */

const CACHE_KEY = 'hrms:table-head-colour'
const HEX = /^#[0-9a-fA-F]{6}$/

export const HEADING_COLOUR_PRESETS: { label: string; value: string }[] = [
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Navy', value: '#1e3a8a' },
  { label: 'Slate', value: '#334155' },
  { label: 'Teal', value: '#0f766e' },
  { label: 'Green', value: '#15803d' },
  { label: 'Maroon', value: '#9f1239' },
  { label: 'Sky', value: '#bae6fd' },
  { label: 'Mint', value: '#bbf7d0' },
  { label: 'Yellow', value: '#fde68a' },
  { label: 'Rose', value: '#fecdd3' },
]

export const normaliseColour = (value: unknown): string | null =>
  typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null

/** Dark text on light headings, white text on dark ones. */
export function headingTextColour(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.45 ? '#1e293b' : '#ffffff'
}

export function readCachedHeadingColour(): string | null {
  try {
    return normaliseColour(localStorage.getItem(CACHE_KEY))
  } catch {
    return null
  }
}

function writeCachedHeadingColour(colour: string | null) {
  try {
    if (colour) localStorage.setItem(CACHE_KEY, colour)
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Private windows may refuse storage; the colour still applies this visit.
  }
}

/** Paint (or clear) the heading colour on every table in the app. */
export function applyHeadingColour(colour: string | null) {
  const root = document.documentElement
  const hex = normaliseColour(colour)
  if (!hex) {
    root.removeAttribute('data-table-head')
    root.style.removeProperty('--table-head-bg')
    root.style.removeProperty('--table-head-text')
    return
  }
  root.setAttribute('data-table-head', '')
  root.style.setProperty('--table-head-bg', hex)
  root.style.setProperty('--table-head-text', headingTextColour(hex))
}

interface Appearance {
  /** True when the colour is stored for the whole organisation. */
  shared: boolean
  colour: string | null
}

export function useHeadingColour() {
  return useQuery({
    queryKey: ['app-appearance'],
    staleTime: 60_000,
    queryFn: async (): Promise<Appearance> => {
      const { data, error } = await supabase
        .from('app_appearance' as never)
        .select('table_head_color')
        .maybeSingle()
      if (error) return { shared: false, colour: readCachedHeadingColour() }
      const row = data as { table_head_color: string | null } | null
      return { shared: true, colour: normaliseColour(row?.table_head_color) }
    },
  })
}

/** Keeps the page painted in the saved colour; mount once in the app shell. */
export function useApplyHeadingColour() {
  const { data } = useHeadingColour()
  useEffect(() => {
    if (!data) return
    writeCachedHeadingColour(data.colour)
    applyHeadingColour(data.colour)
  }, [data])
}

export function useSaveHeadingColour() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { colour: string | null; shared: boolean }) => {
      const colour = normaliseColour(input.colour)
      if (input.shared) {
        const { data, error } = await supabase
          .from('app_appearance' as never)
          .upsert({ id: true, table_head_color: colour } as never)
          .select('id')
        if (error) throw error
        if (!(data as unknown[] | null)?.length) {
          throw new Error('Not allowed to change the heading colour')
        }
      }
      writeCachedHeadingColour(colour)
      return colour
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-appearance'] }),
  })
}
