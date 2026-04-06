import { computed, type Ref } from 'vue'
import type { MergedRecognitionItem, NodeInfo, RecognitionAttempt } from '../../types'
import { buildNodeRecognitionAttempts } from '../../utils/nodeFlow'
import {
  buildNextListDisplayName,
  buildRecognitionTargetByNextName,
  resolveRecognitionNextListName,
} from '../../utils/nextListPresentation'

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

export const useMergedRecognitionList = (params: UseMergedRecognitionListParams) => {
  const mergedRecognitionList = computed<MergedRecognitionItem[]>(() => {
    const node = params.node.value
    const result: MergedRecognitionItem[] = []

    const attempts = buildNodeRecognitionAttempts(node)
    const nextList: NextListItem[] = node.next_list ?? []
    const recognitionTargetByNextName = buildRecognitionTargetByNextName(attempts, nextList)
    const nextListNames = new Set<string>(nextList.map((item: NextListItem) => item.name))

    if (!attempts.length) {
      if (nextList.length > 0) {
        nextList.forEach((nextItem: NextListItem) => {
          const displayName = buildNextListDisplayName(nextItem)
          result.push({
            name: displayName,
            status: 'not-recognized'
          })
        })
      }
      return result
    }

    const nextEntries: NextEntry[] = nextList.map((nextItem: NextListItem) => {
      const displayName = buildNextListDisplayName(
        nextItem,
        recognitionTargetByNextName.get(nextItem.name),
        ''
      )
      return {
        name: nextItem.name,
        displayName,
        nextItem,
      }
    })

    // next_list 为空时，保持原始尝试序列展示。
    if (nextEntries.length === 0) {
      attempts.forEach((attempt, index) => {
        result.push({
          name: attempt.name,
          status: attempt.status,
          attemptIndex: index,
          attempt,
        })
      })
      return result
    }

    // 多轮识别：先按尝试序列切分轮次，再在轮内按 next_list 顺序全量展示。
    const nextIndexMap = new Map<string, number>()
    const nextDisplayMap = new Map<string, string>()
    nextEntries.forEach((nextEntry: NextEntry, idx: number) => {
      if (!nextIndexMap.has(nextEntry.name)) {
        nextIndexMap.set(nextEntry.name, idx)
        nextDisplayMap.set(nextEntry.name, nextEntry.displayName)
      }
    })

    type RoundAttempt = { attempt: RecognitionAttempt; index: number }
    const rounds: RoundAttempt[][] = [[]]
    let currentRound = 0
    let expectedNextIndex = 0

    attempts.forEach((attempt, index) => {
      const matchName = resolveRecognitionNextListName(attempt, nextListNames)
      const nextIndex = nextIndexMap.get(matchName)
      const hasRoundData = rounds[currentRound].length > 0

      // 命中 next_list 顺序回退时，认为进入新一轮。
      if (hasRoundData && nextIndex != null && nextIndex < expectedNextIndex) {
        rounds.push([])
        currentRound += 1
        expectedNextIndex = 0
      }

      rounds[currentRound].push({ attempt, index })

      if (nextIndex != null) {
        expectedNextIndex = nextIndex + 1
      }

      // 命中成功后通常进入下一轮（同节点重试场景）。
      if (attempt.status === 'success') {
        rounds.push([])
        currentRound += 1
        expectedNextIndex = 0
      }
    })

    while (rounds.length > 0 && rounds[rounds.length - 1].length === 0) {
      rounds.pop()
    }

    const useRoundSeparator = rounds.length > 1

    rounds.forEach((roundAttempts, roundIdx) => {
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

      roundAttempts.forEach((roundAttempt) => {
        const matchName = resolveRecognitionNextListName(roundAttempt.attempt, nextListNames)
        const bucket = roundBuckets.get(matchName)
        if (bucket) {
          bucket.push(roundAttempt)
          return
        }
        if (nextIndexMap.has(matchName)) {
          roundBuckets.set(matchName, [roundAttempt])
        } else {
          outOfNextList.push(roundAttempt)
        }
      })

      nextEntries.forEach((nextEntry: NextEntry) => {
        const bucket = roundBuckets.get(nextEntry.name)
        const matched = bucket?.shift()
        if (matched) {
          const matchedDisplayName = buildNextListDisplayName(
            nextEntry.nextItem,
            matched.attempt.name,
            ''
          )
          result.push({
            name: matchedDisplayName,
            status: matched.attempt.status,
            attemptIndex: matched.index,
            attempt: matched.attempt,
          })
        } else {
          result.push({
            name: nextEntry.displayName,
            status: 'not-recognized',
          })
        }
      })

      const remainingMatched = [...roundBuckets.values()].flat()
      const tail = [...outOfNextList, ...remainingMatched].sort((a, b) => a.index - b.index)
      tail.forEach(({ attempt, index }) => {
        const matchName = resolveRecognitionNextListName(attempt, nextListNames)
        const name = nextDisplayMap.get(matchName) ?? attempt.name
        result.push({
          name,
          status: attempt.status,
          attemptIndex: index,
          attempt,
        })
      })
    })

    return result
  })

  const visibleRecognitionList = computed<MergedRecognitionItem[]>(() => {
    const source = mergedRecognitionList.value
    if (params.showNotRecognizedNodes.value) return source

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

    source.forEach((item: MergedRecognitionItem) => {
      if (item.isRoundSeparator) {
        flushRound()
        currentSeparator = item
        currentVisibleItems = []
        return
      }
      if (item.status !== 'not-recognized') {
        currentVisibleItems.push(item)
      }
    })

    flushRound()
    return result
  })

  return {
    mergedRecognitionList,
    visibleRecognitionList,
  }
}
