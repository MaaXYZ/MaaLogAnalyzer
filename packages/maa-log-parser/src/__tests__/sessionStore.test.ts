import { describe, expect, it } from 'vitest'
import { AnalyzerSessionStore, createAnalyzerSessionStore } from '../service/sessionStore'
import type { AnalyzerSession } from '../service/types'

const createSession = (sessionId: string): AnalyzerSession => ({
  sessionId,
  artifacts: {} as AnalyzerSession['artifacts'],
  tasks: [],
  warnings: [],
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('AnalyzerSessionStore', () => {
  it('retains at most eight sessions by default', () => {
    const store = createAnalyzerSessionStore({
      now: () => 0,
    })

    for (let index = 1; index <= 9; index += 1) {
      store.set(createSession(`session-${index}`))
    }

    expect(store.get('session-1')).toBeUndefined()
    expect(store.values().map((session) => session.sessionId)).toEqual([
      'session-2',
      'session-3',
      'session-4',
      'session-5',
      'session-6',
      'session-7',
      'session-8',
      'session-9',
    ])
  })

  it('expires sessions after the default thirty-minute idle TTL', () => {
    let now = 0
    const store = createAnalyzerSessionStore({ now: () => now })
    store.set(createSession('session-1'))

    now = 30 * 60 * 1000 - 1
    expect(store.get('session-1')).toBeDefined()

    now += 30 * 60 * 1000
    expect(store.get('session-1')).toBeUndefined()
  })

  it('slides the idle TTL when a session is read', () => {
    let now = 0
    const store = new AnalyzerSessionStore({
      idleTtlMs: 100,
      now: () => now,
    })
    const session = createSession('session-1')
    store.set(session)

    now = 99
    expect(store.get('session-1')).toBe(session)
    now = 198
    expect(store.get('session-1')).toBe(session)
    now = 298
    expect(store.get('session-1')).toBeUndefined()
  })

  it('lazily removes expired sessions during writes', () => {
    let now = 0
    const store = createAnalyzerSessionStore({
      maxSessions: 2,
      idleTtlMs: 100,
      now: () => now,
    })
    store.set(createSession('stale'))

    now = 100
    store.set(createSession('fresh'))

    expect(store.values().map((session) => session.sessionId)).toEqual(['fresh'])
  })

  it('evicts the least recently used session after successful reads touch it', () => {
    const store = createAnalyzerSessionStore({
      maxSessions: 2,
      idleTtlMs: Number.POSITIVE_INFINITY,
      now: () => 0,
    })
    const first = createSession('first')
    store.set(first)
    store.set(createSession('second'))

    expect(store.get('first')).toBe(first)
    store.set(createSession('third'))

    expect(store.get('second')).toBeUndefined()
    expect(store.values().map((session) => session.sessionId)).toEqual(['first', 'third'])
  })

  it('allows Infinity to disable both retention limits', () => {
    let now = 0
    const store = createAnalyzerSessionStore({
      maxSessions: Number.POSITIVE_INFINITY,
      idleTtlMs: Number.POSITIVE_INFINITY,
      now: () => now,
    })

    for (let index = 1; index <= 12; index += 1) {
      store.set(createSession(`session-${index}`))
    }
    now = Number.MAX_SAFE_INTEGER

    expect(store.get('session-1')).toBeDefined()
    expect(store.values()).toHaveLength(12)
  })
})
