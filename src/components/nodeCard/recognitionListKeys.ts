import type { MergedRecognitionItem } from '../../types'

export const buildRecognitionItemKey = (
  item: MergedRecognitionItem,
  index: number
): string => {
  if (item.isRoundSeparator) {
    return `round-${item.roundIndex ?? index}-${item.name}`
  }
  if (item.attemptIndex != null) {
    return `attempt-${item.attemptIndex}`
  }
  return `placeholder-${index}-${item.name}`
}
