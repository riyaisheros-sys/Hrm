import { describe, expect, it } from 'vitest'
import { safeFileName } from './storageKey'

const KEY_SAFE = /^[A-Za-z0-9._-]+$/

describe('safeFileName', () => {
  it('leaves a plain name alone', () => {
    expect(safeFileName('resume.pdf')).toBe('resume.pdf')
  })

  it('strips the hidden no-break space in WhatsApp image names', () => {
    const name = safeFileName('WhatsApp Image 2026-11-20 at 1.12.13 PM.jpeg')
    expect(name).toMatch(KEY_SAFE)
    expect(name.endsWith('.jpeg')).toBe(true)
  })

  it('handles brackets, hashes and spaces', () => {
    expect(safeFileName('Aadhaar Card (1) [final] #2.PDF')).toBe('Aadhaar-Card-1-final-2.pdf')
  })

  it('falls back to "file" when nothing survives (non-Latin names)', () => {
    expect(safeFileName('आधार कार्ड.pdf')).toBe('file.pdf')
  })

  it('works without an extension', () => {
    expect(safeFileName('notes')).toBe('notes')
    expect(safeFileName('###')).toBe('file')
  })
})
