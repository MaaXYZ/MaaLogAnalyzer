/**
 * n/N 在文本搜索结果里前后跳。
 *
 * - 按行号定位当前项（selectedLine 也可能是点在原文里的行，不在结果里就当作“没有当前项”）；
 * - 两端夹住，不做环绕；没有当前项时回到第一条；
 * - 结果为空返回 null。
 */
export const resolveSearchResultStepLine = (
  results: ReadonlyArray<{ lineNumber: number }>,
  currentLine: number | null,
  delta: number,
): number | null => {
  if (results.length === 0) return null

  const current =
    currentLine == null ? -1 : results.findIndex((item) => item.lineNumber === currentLine)
  const next = current < 0 ? 0 : current + delta
  if (next < 0 || next >= results.length) return null

  return results[next]?.lineNumber ?? null
}
