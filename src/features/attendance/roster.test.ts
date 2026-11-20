import { describe, expect, it } from 'vitest'
import { resolveRoster, type RosterUser } from './roster'

const user = (id: string, extra: Partial<RosterUser> = {}): RosterUser => ({
  id,
  full_name: id,
  email: `${id}@x.test`,
  status: 'active',
  ...extra,
})
const ids = (list: RosterUser[]) => list.map((u) => u.id)

// Mirrors the production situation: three people work and punch, three
// owner accounts have never marked attendance.
const users = [user('aarti'), user('raj'), user('riya'), user('simi'), user('sunil'), user('yash')]
const everMarked = new Set(['aarti', 'raj', 'riya'])
const base = {
  users,
  everMarked,
  onFullDayLeave: new Set<string>(),
  holidayName: null,
}

describe('resolveRoster', () => {
  it('does not count accounts that never mark attendance as absent', () => {
    const r = resolveRoster({ ...base, date: '2026-11-20', markedOnDate: new Set(['aarti', 'raj', 'riya']) })
    expect(ids(r.expected)).toEqual(['aarti', 'raj', 'riya'])
    expect(ids(r.notTracked)).toEqual(['simi', 'sunil', 'yash'])
    expect(r.notPunched).toEqual([])
  })

  it('counts a tracked employee with no punch as absent', () => {
    const r = resolveRoster({ ...base, date: '2026-11-20', markedOnDate: new Set(['aarti', 'riya']) })
    expect(ids(r.notPunched)).toEqual(['raj'])
  })

  it('treats approved full-day leave as on leave, not absent', () => {
    const r = resolveRoster({
      ...base,
      date: '2026-11-18',
      markedOnDate: new Set(['aarti', 'riya']),
      onFullDayLeave: new Set(['raj']),
    })
    expect(ids(r.onLeave)).toEqual(['raj'])
    expect(r.notPunched).toEqual([])
  })

  it('expects nobody on a Sunday or a holiday', () => {
    const sunday = resolveRoster({ ...base, date: '2026-11-15', markedOnDate: new Set() })
    expect(sunday.offDay).toBe('Sunday')
    expect(sunday.notPunched).toEqual([])
    const holiday = resolveRoster({ ...base, date: '2026-11-10', markedOnDate: new Set(), holidayName: 'Diwali' })
    expect(holiday.offDay).toBe('Diwali')
    expect(holiday.notPunched).toEqual([])
  })

  it('lets the admin override the automatic rule either way', () => {
    const r = resolveRoster({
      ...base,
      users: [
        user('newjoiner', { attendance_exempt: false }), // never punched, but must be counted
        user('riya', { attendance_exempt: true }), // punches, but excluded on purpose
        user('aarti'),
      ],
      date: '2026-11-20',
      markedOnDate: new Set(['aarti']),
    })
    expect(ids(r.expected)).toEqual(['newjoiner', 'aarti'])
    expect(ids(r.notTracked)).toEqual(['riya'])
    expect(ids(r.notPunched)).toEqual(['newjoiner'])
  })

  it('ignores inactive accounts', () => {
    const r = resolveRoster({
      ...base,
      users: [user('aarti'), user('left', { status: 'inactive' })],
      everMarked: new Set(['aarti', 'left']),
      date: '2026-11-20',
      markedOnDate: new Set(),
    })
    expect(ids(r.expected)).toEqual(['aarti'])
    expect(ids(r.notPunched)).toEqual(['aarti'])
  })
})
