/** Readiness belongs to one panel; hiding/revealing it does not reset the receiver. */
export class WebviewReadiness {
  private ready = false
  private disposed = false
  private readonly waiters = new Set<(error?: Error) => void>()

  wait(timeoutMs = 30_000): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('The analyzer panel was closed'))
    if (this.ready) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error): void => {
        clearTimeout(timer)
        this.waiters.delete(finish)
        if (error) reject(error)
        else resolve()
      }
      const timer = setTimeout(
        () => finish(new Error('Timed out waiting for the analyzer file receiver to initialize')),
        timeoutMs,
      )
      this.waiters.add(finish)
    })
  }

  markReady(): void {
    if (this.disposed) return
    this.ready = true
    for (const finish of this.waiters) finish()
  }

  reset(): void {
    this.ready = false
  }

  cancelPending(error: Error): void {
    for (const finish of this.waiters) finish(error)
  }

  dispose(): void {
    this.disposed = true
    this.cancelPending(new Error('The analyzer panel was closed'))
  }
}
