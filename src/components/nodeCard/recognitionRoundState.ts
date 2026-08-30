import type { MergedRecognitionItem } from '../../types'

/**
 * 在详细/树形展示时，过滤掉已折叠的“完全未识别”轮次内容。
 * 这类轮次没有任何成功/运行中的识别，全部识别失败（或仅有未识别占位）；
 * 折叠时保留轮次分隔符，展开后可查看全部内容。
 */
export const filterCollapsedUnrecognizedRounds = (
  items: readonly MergedRecognitionItem[],
  fullyUnrecognizedRoundIndexes: ReadonlySet<number>,
  isRoundExpanded: (roundIndex: number) => boolean,
): MergedRecognitionItem[] => {
  if (fullyUnrecognizedRoundIndexes.size === 0) {
    return items as MergedRecognitionItem[]
  }

  const result: MergedRecognitionItem[] = []
  let currentRoundIndex: number | null = null
  let currentRoundFullyUnrecognized = false

  for (const item of items) {
    if (item.isRoundSeparator) {
      currentRoundIndex = item.roundIndex ?? null
      currentRoundFullyUnrecognized =
        currentRoundIndex != null && fullyUnrecognizedRoundIndexes.has(currentRoundIndex)
      result.push(item)
      continue
    }

    if (
      currentRoundFullyUnrecognized &&
      currentRoundIndex != null &&
      !isRoundExpanded(currentRoundIndex)
    ) {
      continue
    }

    result.push(item)
  }

  return result
}
