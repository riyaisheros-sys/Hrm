import { describe, expect, it } from 'vitest'
import { formatLateBy, planningLateMinutes } from './late'

// Slot 10:00–12:00 IST on 2 Nov 2026. IST = UTC+5:30.
const slot = { planDate: '2026-11-02', endTime: '12:00:00', timeZone: 'Asia/Kolkata' }

describe('planningLateMinutes', () => {
  it('is on time when entered before the slot ends', () => {
    expect(planningLateMinutes({ ...slot, createdAt: '2026-11-02T05:00:00Z' })).toBe(0) // 10:30 IST
  })

  it('is on time within the grace period after the slot', () => {
    expect(planningLateMinutes({ ...slot, createdAt: '2026-11-02T06:55:00Z' })).toBe(0) // 12:25 IST
  })

  it('is late once past the grace, measured from the slot end', () => {
    expect(planningLateMinutes({ ...slot, createdAt: '2026-11-02T08:40:00Z' })).toBe(130) // 14:10 IST
  })

  it('counts a next-day entry as late', () => {
    expect(planningLateMinutes({ ...slot, createdAt: '2026-11-03T04:30:00Z' })).toBe(22 * 60) // 10:00 IST next day
  })

  it('honours a custom grace', () => {
    const createdAt = '2026-11-02T07:30:00Z' // 13:00 IST, 60 min after
    expect(planningLateMinutes({ ...slot, createdAt, graceMinutes: 90 })).toBe(0)
    expect(planningLateMinutes({ ...slot, createdAt, graceMinutes: 0 })).toBe(60)
  })

  it('falls back to the day end when the slot has no end time', () => {
    const base = { planDate: '2026-11-02', endTime: null, dayEnd: '18:30:00', timeZone: 'Asia/Kolkata' }
    expect(planningLateMinutes({ ...base, createdAt: '2026-11-02T12:00:00Z' })).toBe(0) // 17:30 IST
    expect(planningLateMinutes({ ...base, createdAt: '2026-11-02T14:30:00Z' })).toBe(90) // 20:00 IST
  })
})

describe('formatLateBy', () => {
  it('formats minutes, hours and days', () => {
    expect(formatLateBy(45)).toBe('45m')
    expect(formatLateBy(130)).toBe('2h 10m')
    expect(formatLateBy(1500)).toBe('1d 1h')
    expect(formatLateBy(0)).toBe('')
  })
})
