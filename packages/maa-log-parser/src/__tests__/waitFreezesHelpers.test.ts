import { describe, expect, it } from 'vitest'
import {
  buildWaitFreezesFlowItems,
  normalizeWaitFreezesId,
  upsertWaitFreezesState,
} from '../waitFreezes/helpers'

const identity = (value: string) => value

describe('WaitFreezesHelpers', () => {
  it('normalizes wait_freezes id from number/string and rejects invalid values', () => {
    expect(normalizeWaitFreezesId(12)).toBe(12)
    expect(normalizeWaitFreezesId('34')).toBe(34)
    expect(normalizeWaitFreezesId('x')).toBeNull()
    expect(normalizeWaitFreezesId(undefined)).toBeNull()
  })

  it('upserts runtime state and keeps first ts/order for same wf_id', () => {
    const runtimeStates = new Map<number, any>()
    const resolveEventFocus = (details: Record<string, any>, fallback?: any) => {
      return Object.prototype.hasOwnProperty.call(details, 'focus')
        ? details.focus
        : fallback
    }
    const findWaitFreezesImages = (_ts: string, actionName: string) => {
      return actionName === 'NodeA' ? ['imgA.png'] : undefined
    }

    upsertWaitFreezesState({
      runtimeStates,
      details: {
        wf_id: '1',
        phase: 'pre',
      },
      timestamp: '2026-04-08 00:00:00.100',
      status: 'running',
      eventOrder: 10,
      activeNodeId: 101,
      activeNodeName: 'NodeA',
      intern: identity,
      resolveEventFocus,
      findWaitFreezesImages,
    })

    upsertWaitFreezesState({
      runtimeStates,
      details: {
        wf_id: 1,
        phase: 'post',
        elapsed: 23,
        reco_ids: [1, '2', 'bad'],
        roi: [1, 2, 3, 4],
        param: { timeout: 1000 },
        focus: { x: 10, y: 20 },
      },
      timestamp: '2026-04-08 00:00:01.200',
      status: 'failed',
      eventOrder: 99,
      activeNodeId: 101,
      activeNodeName: 'NodeA',
      intern: identity,
      resolveEventFocus,
      findWaitFreezesImages,
    })

    const state = runtimeStates.get(1)
    expect(state).toBeTruthy()
    expect(state.ts).toBe('2026-04-08 00:00:00.100')
    expect(state.end_ts).toBe('2026-04-08 00:00:01.200')
    expect(state.order).toBe(10)
    expect(state.status).toBe('failed')
    expect(state.phase).toBe('post')
    expect(state.node_id).toBe(101)
    expect(state.elapsed).toBe(23)
    expect(state.reco_ids).toEqual([1, 2])
    expect(state.images).toEqual(['imgA.png'])
    expect(state.focus).toEqual({ x: 10, y: 20 })
  })

  it('builds wait_freezes flow items sorted by order then wf_id', () => {
    const runtimeStates = new Map<number, any>()
    runtimeStates.set(3, {
      wf_id: 3,
      name: 'C',
      node_id: 7003,
      ts: '2026-04-08 00:00:00.300',
      status: 'success',
      order: 2,
    })
    runtimeStates.set(2, {
      wf_id: 2,
      name: 'B',
      node_id: 7002,
      ts: '2026-04-08 00:00:00.200',
      status: 'running',
      order: 1,
    })
    runtimeStates.set(1, {
      wf_id: 1,
      name: 'A',
      node_id: 7001,
      ts: '2026-04-08 00:00:00.100',
      status: 'failed',
      order: 1,
    })

    const items = buildWaitFreezesFlowItems(runtimeStates, 42)
    expect(items.map((item) => item.wait_freezes_details?.wf_id)).toEqual([1, 2, 3])
    expect(items.map((item) => item.id)).toEqual([
      'node.wait_freezes.42.7001.1',
      'node.wait_freezes.42.7002.2',
      'node.wait_freezes.42.7003.3',
    ])
    expect(items.map((item) => item.task_id)).toEqual([42, 42, 42])
    expect(items.map((item) => item.node_id)).toEqual([7001, 7002, 7003])
  })
})
