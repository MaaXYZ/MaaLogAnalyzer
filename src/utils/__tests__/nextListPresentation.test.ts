import { describe, expect, it } from 'vitest'
import type { NodeInfo, RecognitionAttempt, UnifiedFlowItem } from '../../types'
import {
  buildNextListDisplayName,
  buildRecognitionTargetByNextName,
  resolveRecognitionNextListName,
} from '../nextListPresentation'
import { collectNodeNavMatchDetails } from '../../views/process/composables/nodeNavSearch/match'

const nextList: NodeInfo['next_list'] = [
  { name: 'X', anchor: true, jump_back: false },
  { name: 'Y', anchor: true, jump_back: false },
  { name: 'c', anchor: false, jump_back: false },
  { name: 'd', anchor: false, jump_back: false },
]

const recognitionAttempts: RecognitionAttempt[] = [
  {
    reco_id: 400000489,
    name: 'b',
    anchor_name: 'X',
    ts: '2026-04-03 08:46:12.354',
    end_ts: '2026-04-03 08:46:12.407',
    status: 'failed',
  },
  {
    reco_id: 400000490,
    name: 'd',
    ts: '2026-04-03 08:46:12.411',
    end_ts: '2026-04-03 08:46:12.463',
    status: 'success',
  },
]

describe('nextListPresentation', () => {
  it('maps anchor candidates to the resolved recognition target name', () => {
    const targetByNextName = buildRecognitionTargetByNextName(recognitionAttempts, nextList)
    const nextListNames = new Set(nextList.map(item => item.name))

    expect(resolveRecognitionNextListName(recognitionAttempts[0], nextListNames)).toBe('X')
    expect(targetByNextName.get('X')).toBe('b')
    expect(targetByNextName.get('d')).toBe('d')
    expect(buildNextListDisplayName(nextList[0], targetByNextName.get('X'))).toBe('[Anchor] X = b')
  })

  it('lets node navigation search hit the resolved anchor target name', () => {
    const nodeFlow: UnifiedFlowItem[] = recognitionAttempts.map((attempt, index) => ({
      id: `node.recognition.${index}`,
      type: 'recognition',
      name: attempt.name,
      status: attempt.status,
      ts: attempt.ts,
      end_ts: attempt.end_ts,
      reco_id: attempt.reco_id,
      anchor_name: attempt.anchor_name,
    }))

    const node: NodeInfo = {
      node_id: 300000215,
      name: 'a',
      ts: '2026-04-03 08:46:11.034',
      end_ts: '2026-04-03 08:46:13.181',
      status: 'success',
      task_id: 200000064,
      next_list: nextList,
      node_flow: nodeFlow,
    }

    expect(collectNodeNavMatchDetails(node, 'b')).toContainEqual({
      kind: 'next-list',
      text: '[Anchor] X = b',
    })
    expect(collectNodeNavMatchDetails(node, 'x')).toContainEqual({
      kind: 'next-list',
      text: '[Anchor] X = b',
    })
  })
})
