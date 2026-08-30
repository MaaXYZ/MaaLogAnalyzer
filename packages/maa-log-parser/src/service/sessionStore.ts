import type { AnalyzerSession, AnalyzerSessionStoreLike } from './types'

const DEFAULT_MAX_SESSIONS = 8
const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000

export interface AnalyzerSessionStoreOptions {
  maxSessions?: number
  idleTtlMs?: number
  now?: () => number
}

interface StoredAnalyzerSession {
  session: AnalyzerSession
  lastAccessedAt: number
}

const normalizeMaxSessions = (value: number): number => {
  if (value === Number.POSITIVE_INFINITY) return value
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('maxSessions must be a non-negative integer or Infinity')
  }
  return value
}

const normalizeIdleTtlMs = (value: number): number => {
  if (value === Number.POSITIVE_INFINITY) return value
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('idleTtlMs must be a non-negative finite number or Infinity')
  }
  return value
}

export class AnalyzerSessionStore implements AnalyzerSessionStoreLike {
  private readonly sessions = new Map<string, StoredAnalyzerSession>()
  private readonly maxSessions: number
  private readonly idleTtlMs: number
  private readonly now: () => number
  private lastObservedAt = Number.NEGATIVE_INFINITY

  constructor(options: AnalyzerSessionStoreOptions = {}) {
    this.maxSessions = normalizeMaxSessions(options.maxSessions ?? DEFAULT_MAX_SESSIONS)
    this.idleTtlMs = normalizeIdleTtlMs(options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS)
    this.now = options.now ?? Date.now
  }

  get(sessionId: string): AnalyzerSession | undefined {
    const now = this.readNow()
    this.deleteExpired(now)

    const entry = this.sessions.get(sessionId)
    if (!entry) return undefined

    entry.lastAccessedAt = now
    this.sessions.delete(sessionId)
    this.sessions.set(sessionId, entry)
    return entry.session
  }

  set(session: AnalyzerSession): AnalyzerSession {
    const now = this.readNow()
    this.deleteExpired(now)
    this.sessions.delete(session.sessionId)
    this.sessions.set(session.sessionId, {
      session,
      lastAccessedAt: now,
    })
    this.enforceMaxSessions()
    return session
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }

  clear(): void {
    this.sessions.clear()
  }

  values(): AnalyzerSession[] {
    this.deleteExpired(this.readNow())
    return [...this.sessions.values()].map((entry) => entry.session)
  }

  private readNow(): number {
    const current = this.now()
    if (!Number.isFinite(current)) {
      throw new RangeError('now must return a finite timestamp')
    }
    this.lastObservedAt = Math.max(this.lastObservedAt, current)
    return this.lastObservedAt
  }

  private deleteExpired(now: number): void {
    if (this.idleTtlMs === Number.POSITIVE_INFINITY) return

    for (const [sessionId, entry] of this.sessions) {
      if (now - entry.lastAccessedAt >= this.idleTtlMs) {
        this.sessions.delete(sessionId)
      }
    }
  }

  private enforceMaxSessions(): void {
    if (this.maxSessions === Number.POSITIVE_INFINITY) return

    while (this.sessions.size > this.maxSessions) {
      const oldest = this.sessions.keys().next()
      if (oldest.done) return
      this.sessions.delete(oldest.value)
    }
  }
}

export const createAnalyzerSessionStore = (
  options: AnalyzerSessionStoreOptions = {},
): AnalyzerSessionStore => {
  return new AnalyzerSessionStore(options)
}
