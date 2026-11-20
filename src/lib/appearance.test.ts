import { afterEach, describe, expect, it } from 'vitest'
import { applyHeadingColour, headingTextColour, normaliseColour } from './appearance'

describe('table heading colour', () => {
  afterEach(() => applyHeadingColour(null))

  it('accepts only six-digit hex colours', () => {
    expect(normaliseColour('#4F46E5')).toBe('#4f46e5')
    expect(normaliseColour('red')).toBeNull()
    expect(normaliseColour('#fff')).toBeNull()
    expect(normaliseColour(null)).toBeNull()
  })

  it('picks readable text for dark and light headings', () => {
    expect(headingTextColour('#1e3a8a')).toBe('#ffffff')
    expect(headingTextColour('#4f46e5')).toBe('#ffffff')
    expect(headingTextColour('#fde68a')).toBe('#1e293b')
    expect(headingTextColour('#bae6fd')).toBe('#1e293b')
  })

  it('paints and clears the colour on the document', () => {
    const root = document.documentElement
    applyHeadingColour('#0f766e')
    expect(root.hasAttribute('data-table-head')).toBe(true)
    expect(root.style.getPropertyValue('--table-head-bg')).toBe('#0f766e')
    expect(root.style.getPropertyValue('--table-head-text')).toBe('#ffffff')
    applyHeadingColour(null)
    expect(root.hasAttribute('data-table-head')).toBe(false)
    expect(root.style.getPropertyValue('--table-head-bg')).toBe('')
  })
})
