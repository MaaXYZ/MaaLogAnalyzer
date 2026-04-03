import type { NextListItem, RecognitionAttempt } from '../types'

const normalizeOptionalName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export const resolveRecognitionNextListName = (
  attempt: RecognitionAttempt,
  nextListNames?: ReadonlySet<string>
): string => {
  const anchorName = normalizeOptionalName(attempt.anchor_name)
  if (anchorName && (!nextListNames || nextListNames.has(anchorName))) {
    return anchorName
  }
  return attempt.name || ''
}

export const buildRecognitionTargetByNextName = (
  attempts: RecognitionAttempt[],
  nextList: NextListItem[]
): Map<string, string> => {
  const nextListNames = new Set(nextList.map(item => item.name))
  const result = new Map<string, string>()

  attempts.forEach((attempt) => {
    const matchName = resolveRecognitionNextListName(attempt, nextListNames)
    const targetName = attempt.name || ''
    if (!matchName || !targetName || result.has(matchName)) return
    result.set(matchName, targetName)
  })

  return result
}

const buildNextListCoreName = (
  item: NextListItem,
  resolvedTargetName?: string
): string => {
  const baseName = item.name || '未命名 Next'
  if (item.anchor && resolvedTargetName) {
    return `${baseName} = ${resolvedTargetName}`
  }
  return baseName
}

export const buildNextListDisplayName = (
  item: NextListItem,
  resolvedTargetName?: string,
  prefixSeparator = ' '
): string => {
  const prefixes: string[] = []
  if (item.jump_back) prefixes.push('[JumpBack]')
  if (item.anchor) prefixes.push('[Anchor]')
  const coreName = buildNextListCoreName(item, resolvedTargetName)
  if (prefixes.length === 0) return coreName
  return `${prefixes.join(prefixSeparator)} ${coreName}`.trim()
}
