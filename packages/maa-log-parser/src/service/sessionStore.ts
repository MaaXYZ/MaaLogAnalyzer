import type { AnalyzerSession, AnalyzerSessionStoreLike } from './types'

export class AnalyzerSessionStore implements AnalyzerSessionStoreLike {
  private readonly sessions = new Map<string, AnalyzerSession>()

  get(sessionId: string): AnalyzerSession | undefined {
    return this.sessions.get(sessionId)
  }

  set(session: AnalyzerSession): AnalyzerSession {
    this.sessions.set(session.sessionId, session)
    return session
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }

  clear(): void {
    this.sessions.clear()
  }

  values(): AnalyzerSession[] {
    return [...this.sessions.values()]
  }
}

export const createAnalyzerSessionStore = (): AnalyzerSessionStore => {
  return new AnalyzerSessionStore()
}
