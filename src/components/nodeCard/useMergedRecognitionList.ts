import { computed, type Ref } from 'vue'
import type { MergedRecognitionItem, NodeInfo, RecognitionAttempt } from '../../types'
import { buildNodeRecognitionAttempts } from '@windsland52/maa-log-parser/node-flow'
import {
  buildNextListDisplayName,
  buildRecognitionTargetByNextName,
  resolveRecognitionNextListName,
} from '@windsland52/maa-log-tools/next-list-presentation'

interface UseMergedRecognitionListParams {
  node: Ref<NodeInfo>
  showNotRecognizedNodes: Ref<boolean>
}

type NextListItem = NodeInfo['next_list'][number]
type NextEntry = {
  name: string
  displayName: string
  nextItem: NextListItem
}
type RoundAttempt = {
  attempt: RecognitionAttempt
  index: number
  matchName: string
}

const appendAttemptItem = (
  result: MergedRecognitionItem[],
  attempt: RecognitionAttempt,
  attemptIndex: number,
  name: string = attempt.name,
) => {
  result.push({
    name,
    status: attempt.status,
    attemptIndex,
    attempt,
  })
}

const appendAttemptsInOriginalOrder = (
  result: MergedRecognitionItem[],
  attempts: RecognitionAttempt[],
) => {
  for (let index = 0; index < attempts.length; index += 1) {
    appendAttemptItem(result, attempts[index], index)
  }
}

const splitAttemptsIntoRounds = (
  attempts: RecognitionAttempt[],
  nextListNames: ReadonlySet<string>,
  nextIndexMap: ReadonlyMap<string, number>,
): RoundAttempt[][] => {
  const rounds: RoundAttempt[][] = [[]]
  let currentRound = 0
  let expectedNextIndex = 0

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index]
    const matchName = resolveRecognitionNextListName(attempt, nextListNames)
    const nextIndex = nextIndexMap.get(matchName)
    const hasRoundData = rounds[currentRound].length > 0

    // Sequence rollback in next_list means a new recognition round.
    if (hasRoundData && nextIndex != null && nextIndex < expectedNextIndex) {
      rounds.push([])
      currentRound += 1
      expectedNextIndex = 0
    }

    rounds[currentRound].push({ attempt, index, matchName })

    if (nextIndex != null) {
      expectedNextIndex = nextIndex + 1
    }

    // Success usually means switching to the next retry round.
    if (attempt.status === 'success') {
      rounds.push([])
      currentRound += 1
      expectedNextIndex = 0
    }
  }

  while (rounds.length > 0 && rounds[rounds.length - 1].length === 0) {
    rounds.pop()
  }

  return rounds
}

const normalizeName = (value: string | undefined): string => {
  return typeof value === 'string' ? value.trim() : ''
}

const registerRoundSplitName = (
  name: string,
  displayName: string,
  nextListNames: Set<string>,
  nextIndexMap: Map<string, number>,
  nextDisplayMap: Map<string, string>,
) => {
  if (!name) return
  if (!nextIndexMap.has(name)) {
    nextIndexMap.set(name, nextIndexMap.size)
    nextDisplayMap.set(name, displayName)
  }
  nextListNames.add(name)
}

const appendRoundItems = (
  result: MergedRecognitionItem[],
  roundAttempts: RoundAttempt[],
  roundIdx: number,
  useRoundSeparator: boolean,
  nextEntries: NextEntry[],
  nextIndexMap: ReadonlyMap<string, number>,
  nextDisplayMap: ReadonlyMap<string, string>,
) => {
  if (useRoundSeparator) {
    result.push({
      name: `—— 第 ${roundIdx + 1} 轮 ——`,
      status: 'not-recognized',
      isRoundSeparator: true,
      roundIndex: roundIdx + 1,
    })
  }

  const roundBuckets = new Map<string, RoundAttempt[]>()
  const outOfNextList: RoundAttempt[] = []

  for (const roundAttempt of roundAttempts) {
    const matchName = roundAttempt.matchName
    if (!nextIndexMap.has(matchName)) {
      outOfNextList.push(roundAttempt)
      continue
    }
    const bucket = roundBuckets.get(matchName)
    if (bucket) {
      bucket.push(roundAttempt)
    } else {
      roundBuckets.set(matchName, [roundAttempt])
    }
  }

  const consumedBucketCountByName = new Map<string, number>()

  for (const nextEntry of nextEntries) {
    const bucket = roundBuckets.get(nextEntry.name)
    const consumedCount = consumedBucketCountByName.get(nextEntry.name) ?? 0
    const matched = bucket?.[consumedCount]

    if (matched) {
      consumedBucketCountByName.set(nextEntry.name, consumedCount + 1)
      const matchedDisplayName = buildNextListDisplayName(
        nextEntry.nextItem,
        matched.attempt.name,
        '',
      )
      appendAttemptItem(result, matched.attempt, matched.index, matchedDisplayName)
      continue
    }

    result.push({
      name: nextEntry.displayName,
      status: 'not-recognized',
    })
  }

  const tail: RoundAttempt[] = [...outOfNextList]
  for (const [name, bucket] of roundBuckets) {
    const consumedCount = consumedBucketCountByName.get(name) ?? 0
    for (let idx = consumedCount; idx < bucket.length; idx += 1) {
      tail.push(bucket[idx])
    }
  }
  tail.sort((left, right) => left.index - right.index)

  for (const roundAttempt of tail) {
    const name = nextDisplayMap.get(roundAttempt.matchName) ?? roundAttempt.attempt.name
    appendAttemptItem(result, roundAttempt.attempt, roundAttempt.index, name)
  }
}

const buildMergedRecognitionItems = (node: NodeInfo): MergedRecognitionItem[] => {
  const result: MergedRecognitionItem[] = []

  const attempts = buildNodeRecognitionAttempts(node)
  const nextList: NextListItem[] = node.next_list ?? []

  if (!attempts.length) {
    if (nextList.length > 0) {
      for (const nextItem of nextList) {
        result.push({
          name: buildNextListDisplayName(nextItem),
          status: 'not-recognized',
        })
      }
    }
    return result
  }

  const recognitionTargetByNextName = buildRecognitionTargetByNextName(attempts, nextList)
  const nextEntries: NextEntry[] = nextList.map((nextItem: NextListItem) => {
    const displayName = buildNextListDisplayName(
      nextItem,
      recognitionTargetByNextName.get(nextItem.name),
      '',
    )
    return {
      name: nextItem.name,
      displayName,
      nextItem,
    }
  })

  const primaryNextListNames = new Set<string>()
  const primaryNextIndexMap = new Map<string, number>()
  const primaryNextDisplayMap = new Map<string, string>()
  nextEntries.forEach((nextEntry: NextEntry) => {
    registerRoundSplitName(
      nextEntry.name,
      nextEntry.displayName,
      primaryNextListNames,
      primaryNextIndexMap,
      primaryNextDisplayMap,
    )
  })

  const matchedByPrimaryNextListCount = attempts.reduce((count, attempt) => {
    const matchName = resolveRecognitionNextListName(attempt, primaryNextListNames)
    return primaryNextIndexMap.has(matchName) ? count + 1 : count
  }, 0)

  let splitNextListNames = primaryNextListNames
  let splitNextIndexMap = primaryNextIndexMap
  let splitNextDisplayMap = primaryNextDisplayMap

  // Fallback only when next_list exists but primary names cannot match any attempts.
  if (primaryNextIndexMap.size > 0 && matchedByPrimaryNextListCount === 0) {
    splitNextListNames = new Set(primaryNextListNames)
    splitNextIndexMap = new Map(primaryNextIndexMap)
    splitNextDisplayMap = new Map(primaryNextDisplayMap)

    for (const attempt of attempts) {
      const anchorName = normalizeName(attempt.anchor_name)
      const attemptName = normalizeName(attempt.name)
      registerRoundSplitName(
        anchorName,
        anchorName,
        splitNextListNames,
        splitNextIndexMap,
        splitNextDisplayMap,
      )
      registerRoundSplitName(
        attemptName,
        attemptName,
        splitNextListNames,
        splitNextIndexMap,
        splitNextDisplayMap,
      )
    }
  }

  if (splitNextIndexMap.size === 0) {
    appendAttemptsInOriginalOrder(result, attempts)
    return result
  }

  const rounds = splitAttemptsIntoRounds(attempts, splitNextListNames, splitNextIndexMap)
  const useRoundSeparator = rounds.length > 1

  if (!useRoundSeparator && nextEntries.length === 0) {
    appendAttemptsInOriginalOrder(result, attempts)
    return result
  }

  for (let roundIdx = 0; roundIdx < rounds.length; roundIdx += 1) {
    appendRoundItems(
      result,
      rounds[roundIdx],
      roundIdx,
      useRoundSeparator,
      nextEntries,
      splitNextIndexMap,
      splitNextDisplayMap,
    )
  }

  return result
}

const buildVisibleRecognitionItems = (
  source: MergedRecognitionItem[],
  showNotRecognizedNodes: boolean,
): MergedRecognitionItem[] => {
  if (showNotRecognizedNodes) return source

  const hasRoundSeparators = source.some((item: MergedRecognitionItem) => item.isRoundSeparator)
  if (!hasRoundSeparators) {
    return source.filter((item: MergedRecognitionItem) => item.status !== 'not-recognized')
  }

  const result: MergedRecognitionItem[] = []
  let currentSeparator: MergedRecognitionItem | null = null
  let currentVisibleItems: MergedRecognitionItem[] = []

  const flushRound = () => {
    if (currentVisibleItems.length === 0) return
    if (currentSeparator) result.push(currentSeparator)
    result.push(...currentVisibleItems)
  }

  for (const item of source) {
    if (item.isRoundSeparator) {
      flushRound()
      currentSeparator = item
      currentVisibleItems = []
      continue
    }
    if (item.status !== 'not-recognized') {
      currentVisibleItems.push(item)
    }
  }

  flushRound()
  return result
}

export const useMergedRecognitionList = (params: UseMergedRecognitionListParams) => {
  const mergedRecognitionList = computed<MergedRecognitionItem[]>(() =>
    buildMergedRecognitionItems(params.node.value),
  )

  const visibleRecognitionList = computed<MergedRecognitionItem[]>(() =>
    buildVisibleRecognitionItems(mergedRecognitionList.value, params.showNotRecognizedNodes.value),
  )

  return {
    mergedRecognitionList,
    visibleRecognitionList,
  }
}
