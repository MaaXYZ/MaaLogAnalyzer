/**
 * String pool that interns strings so equal values share a single reference.
 */
export class StringPool {
  private pool = new Map<string, string>()

  /**
   * Return the pooled instance for the given string, deduplicating equal values.
   */
  intern(str: string | undefined | null): string {
    if (str === undefined || str === null) {
      return ''
    }

    const pooled = this.pool.get(str)
    if (pooled !== undefined) {
      return pooled
    }
    this.pool.set(str, str)
    return str
  }

  /**
   * Clear pooled strings.
   */
  clear(): void {
    this.pool.clear()
  }

  /**
   * Get unique string count.
   */
  size(): number {
    return this.pool.size
  }
}