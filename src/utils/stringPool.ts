/**
 * 字符串池 - 用于统计唯一字符串数量
 *
 * V8 引擎会自动对字符串进行 interning，
 * 因此 intern() 直接返回输入字符串，Set 仅用于统计计数
 */
export class StringPool {
  private pool = new Set<string>()

  /**
   * 字符串驻留 - 记录字符串并返回原值
   */
  intern(str: string | undefined | null): string {
    if (str === undefined || str === null) {
      return ''
    }

    this.pool.add(str)
    return str
  }

  /**
   * 清空字符串池
   */
  clear(): void {
    this.pool.clear()
  }

  /**
   * 获取池中字符串数量
   */
  size(): number {
    return this.pool.size
  }
}
