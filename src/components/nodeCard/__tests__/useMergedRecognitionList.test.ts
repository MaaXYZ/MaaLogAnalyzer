import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import { useMergedRecognitionList } from '../useMergedRecognitionList'

const makeRecognitionFlowItem = (
  index: number,
  name: string,
  status: 'success' | 'failed' | 'running',
  timestamp: string,
): UnifiedFlowItem => {
  return {
    id: `node.recognition.${index}`,
    type: 'recognition',
    name,
    status,
    ts: timestamp,
    end_ts: timestamp,
    reco_id: 1000 + index,
  }
}

const makeNode = (overrides: Partial<NodeInfo> = {}): NodeInfo => {
  return {
    node_id: 1,
    name: 'Root',
    ts: '2026-04-06 00:00:00.000',
    end_ts: '2026-04-06 00:00:01.000',
    status: 'success',
    task_id: 1,
    next_list: [],
    ...overrides,
  }
}

describe('useMergedRecognitionList', () => {
  it('keeps original recognition attempt order when next_list is empty', () => {
    const nodeRef = ref(
      makeNode({
        node_flow: [
          makeRecognitionFlowItem(0, 'A', 'failed', '2026-04-06 00:00:00.100'),
          makeRecognitionFlowItem(1, 'B', 'success', '2026-04-06 00:00:00.200'),
        ],
      }),
    )
    const showNotRecognizedNodes = ref(true)

    const { visibleRecognitionList } = useMergedRecognitionList({
      node: nodeRef,
      showNotRecognizedNodes,
    })

    expect(visibleRecognitionList.value).toMatchObject([
      { name: 'A', status: 'failed', attemptIndex: 0 },
      { name: 'B', status: 'success', attemptIndex: 1 },
    ])
  })

  it('splits multi-round attempts and filters placeholders by settings', () => {
    const nodeRef = ref(
      makeNode({
        next_list: [
          { name: 'A', anchor: false, jump_back: false },
          { name: 'B', anchor: false, jump_back: false },
        ],
        node_flow: [
          makeRecognitionFlowItem(0, 'A', 'failed', '2026-04-06 00:00:00.100'),
          makeRecognitionFlowItem(1, 'B', 'success', '2026-04-06 00:00:00.200'),
          makeRecognitionFlowItem(2, 'A', 'failed', '2026-04-06 00:00:00.300'),
        ],
      }),
    )
    const showNotRecognizedNodes = ref(true)

    const { visibleRecognitionList, fullyUnrecognizedRoundIndexes } = useMergedRecognitionList({
      node: nodeRef,
      showNotRecognizedNodes,
    })

    expect(visibleRecognitionList.value).toMatchObject([
      { isRoundSeparator: true, roundIndex: 1 },
      { name: 'A', status: 'failed', attemptIndex: 0 },
      { name: 'B', status: 'success', attemptIndex: 1 },
      { isRoundSeparator: true, roundIndex: 2 },
      { name: 'A', status: 'failed', attemptIndex: 2 },
      { name: 'B', status: 'not-recognized' },
    ])
    expect(fullyUnrecognizedRoundIndexes.value).toEqual(new Set([2]))

    showNotRecognizedNodes.value = false

    expect(visibleRecognitionList.value).toMatchObject([
      { isRoundSeparator: true, roundIndex: 1 },
      { name: 'A', status: 'failed', attemptIndex: 0 },
      { name: 'B', status: 'success', attemptIndex: 1 },
      { isRoundSeparator: true, roundIndex: 2 },
      { name: 'A', status: 'failed', attemptIndex: 2 },
    ])
    expect(
      visibleRecognitionList.value
        .filter((item) => !item.isRoundSeparator)
        .some((item) => item.status === 'not-recognized'),
    ).toBe(false)
  })

  it('hides pure not-recognized list when placeholders are disabled', () => {
    const nodeRef = ref(
      makeNode({
        next_list: [
          { name: 'X', anchor: false, jump_back: false },
          { name: 'Y', anchor: false, jump_back: false },
        ],
        node_flow: [],
      }),
    )
    const showNotRecognizedNodes = ref(false)

    const { visibleRecognitionList } = useMergedRecognitionList({
      node: nodeRef,
      showNotRecognizedNodes,
    })

    expect(visibleRecognitionList.value).toEqual([])
  })

  it('keeps out-of-next-list attempts in stable tail order within a round', () => {
    const nodeRef = ref(
      makeNode({
        next_list: [
          { name: 'A', anchor: false, jump_back: false },
          { name: 'B', anchor: false, jump_back: false },
        ],
        node_flow: [
          makeRecognitionFlowItem(0, 'C', 'failed', '2026-04-06 00:00:00.100'),
          makeRecognitionFlowItem(1, 'A', 'failed', '2026-04-06 00:00:00.200'),
          makeRecognitionFlowItem(2, 'D', 'failed', '2026-04-06 00:00:00.300'),
        ],
      }),
    )
    const showNotRecognizedNodes = ref(true)

    const { visibleRecognitionList } = useMergedRecognitionList({
      node: nodeRef,
      showNotRecognizedNodes,
    })

    expect(visibleRecognitionList.value).toMatchObject([
      { status: 'failed', attemptIndex: 1 },
      { status: 'not-recognized' },
      { status: 'failed', attemptIndex: 0 },
      { status: 'failed', attemptIndex: 2 },
    ])
  })

  it('splits failed retries into rounds when no recognition succeeds', () => {
    const nodeRef = ref(
      makeNode({
        status: 'failed',
        next_list: [
          { name: 'A', anchor: false, jump_back: false },
          { name: 'B', anchor: false, jump_back: false },
        ],
        node_flow: [
          makeRecognitionFlowItem(0, 'A', 'failed', '2026-04-06 00:00:00.100'),
          makeRecognitionFlowItem(1, 'B', 'failed', '2026-04-06 00:00:00.200'),
          makeRecognitionFlowItem(2, 'A', 'failed', '2026-04-06 00:00:01.100'),
          makeRecognitionFlowItem(3, 'B', 'failed', '2026-04-06 00:00:01.200'),
        ],
      }),
    )
    const showNotRecognizedNodes = ref(true)

    const { visibleRecognitionList, fullyUnrecognizedRoundIndexes } = useMergedRecognitionList({
      node: nodeRef,
      showNotRecognizedNodes,
    })

    expect(visibleRecognitionList.value).toMatchObject([
      { isRoundSeparator: true, roundIndex: 1 },
      { name: 'A', status: 'failed', attemptIndex: 0 },
      { name: 'B', status: 'failed', attemptIndex: 1 },
      { isRoundSeparator: true, roundIndex: 2 },
      { name: 'A', status: 'failed', attemptIndex: 2 },
      { name: 'B', status: 'failed', attemptIndex: 3 },
    ])
    expect(fullyUnrecognizedRoundIndexes.value).toEqual(new Set([1, 2]))
  })

  it('splits rounds when next_list is non-empty but attempt names do not match next names', () => {
    const nodeRef = ref(
      makeNode({
        status: 'failed',
        next_list: [
          { name: 'EntryA', anchor: false, jump_back: false },
          { name: 'EntryB', anchor: false, jump_back: false },
        ],
        node_flow: [
          makeRecognitionFlowItem(0, 'RecoA', 'failed', '2026-04-06 00:00:00.100'),
          makeRecognitionFlowItem(1, 'RecoB', 'failed', '2026-04-06 00:00:00.200'),
          makeRecognitionFlowItem(2, 'RecoA', 'failed', '2026-04-06 00:00:01.100'),
          makeRecognitionFlowItem(3, 'RecoB', 'failed', '2026-04-06 00:00:01.200'),
        ],
      }),
    )
    const showNotRecognizedNodes = ref(false)

    const { visibleRecognitionList, fullyUnrecognizedRoundIndexes } = useMergedRecognitionList({
      node: nodeRef,
      showNotRecognizedNodes,
    })

    expect(visibleRecognitionList.value).toMatchObject([
      { isRoundSeparator: true, roundIndex: 1 },
      { name: 'RecoA', status: 'failed', attemptIndex: 0 },
      { name: 'RecoB', status: 'failed', attemptIndex: 1 },
      { isRoundSeparator: true, roundIndex: 2 },
      { name: 'RecoA', status: 'failed', attemptIndex: 2 },
      { name: 'RecoB', status: 'failed', attemptIndex: 3 },
    ])
    expect(fullyUnrecognizedRoundIndexes.value).toEqual(new Set([1, 2]))
  })
})
