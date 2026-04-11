import { markRaw } from 'vue'
import type { UnifiedFlowItem, WaitFreezesDetail } from '../../types'
import {
  parseNumericArray,
  parseRoi,
  parseWaitFreezesParam,
  readNumberField,
} from '../logEventDecoders'

export type WaitFreezesRuntimeState = {
  wf_id: number
  name: string
  node_id?: number
  phase?: string
  ts: string
  end_ts?: string
  status: 'running' | 'success' | 'failed'
  elapsed?: number
  reco_ids?: number[]
  roi?: [number, number, number, number]
  param?: WaitFreezesDetail['param']
  focus?: any
  images?: string[]
  order: number
}

export const normalizeWaitFreezesId = (value: unknown): number | null => {
  const wfId = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(wfId) ? wfId : null
}

const buildWaitFreezesFlowItemId = (
  state: WaitFreezesRuntimeState,
  taskId?: number
): string => {
  const taskScope = Number.isFinite(taskId) ? String(taskId) : 'na'
  const nodeScope = Number.isFinite(state.node_id) ? String(state.node_id) : 'na'
  return `node.wait_freezes.${taskScope}.${nodeScope}.${state.wf_id}`
}

export const toWaitFreezesFlowItem = (
  state: WaitFreezesRuntimeState,
  taskId?: number
): UnifiedFlowItem => {
  return {
    id: buildWaitFreezesFlowItemId(state, taskId),
    type: 'wait_freezes',
    name: state.name || 'WaitFreezes',
    status: state.status,
    ts: state.ts,
    end_ts: state.end_ts,
    task_id: taskId,
    node_id: state.node_id,
    wait_freezes_details: markRaw({
      wf_id: state.wf_id,
      phase: state.phase,
      elapsed: state.elapsed,
      reco_ids: state.reco_ids,
      roi: state.roi,
      param: state.param,
      focus: state.focus,
      images: state.images,
    }),
  }
}

export const buildWaitFreezesFlowItems = (
  waitFreezesRuntimeStates?: Map<number, WaitFreezesRuntimeState>,
  taskId?: number
): UnifiedFlowItem[] => {
  if (!waitFreezesRuntimeStates || waitFreezesRuntimeStates.size === 0) {
    return []
  }
  return Array.from(waitFreezesRuntimeStates.values())
    .sort((a, b) => {
      const delta = a.order - b.order
      if (delta !== 0) return delta
      return a.wf_id - b.wf_id
    })
    .map((state) => toWaitFreezesFlowItem(state, taskId))
}

interface UpsertWaitFreezesStateParams {
  runtimeStates: Map<number, WaitFreezesRuntimeState>
  details: Record<string, any>
  timestamp: string
  status: 'running' | 'success' | 'failed'
  eventOrder: number
  activeNodeId?: number
  activeNodeName?: string
  intern: (value: string) => string
  resolveEventFocus: (details: Record<string, any>, fallback?: any) => any
  findWaitFreezesImages: (timestamp: string, actionName: string) => string[] | undefined
}

export const upsertWaitFreezesState = (params: UpsertWaitFreezesStateParams): void => {
  const wfId = normalizeWaitFreezesId(
    readNumberField(params.details, 'wf_id') ?? params.details.wf_id
  )
  if (wfId == null) return

  const existing = params.runtimeStates.get(wfId)
  const nowTs = params.intern(params.timestamp)
  const fallbackName = (typeof params.details.name === 'string' && params.details.name.trim())
    ? params.details.name
    : existing?.name
  const name = params.intern(fallbackName || params.activeNodeName || 'WaitFreezes')
  const rawPhase = typeof params.details.phase === 'string' ? params.details.phase.trim() : ''
  const phase = rawPhase ? params.intern(rawPhase) : existing?.phase
  const nodeId = readNumberField(params.details, 'node_id') ?? existing?.node_id ?? params.activeNodeId
  const elapsed = typeof params.details.elapsed === 'number' ? params.details.elapsed : existing?.elapsed
  const recoIds = parseNumericArray(params.details.reco_ids) ?? existing?.reco_ids
  const roi = parseRoi(params.details.roi) ?? existing?.roi
  const param = parseWaitFreezesParam(params.details.param) ?? existing?.param
  const focus = params.resolveEventFocus(params.details, existing?.focus)
  const images = params.findWaitFreezesImages(params.timestamp, name) ?? existing?.images

  params.runtimeStates.set(wfId, {
    wf_id: wfId,
    name,
    node_id: nodeId,
    phase,
    ts: existing?.ts || nowTs,
    end_ts: params.status === 'running' ? (existing?.end_ts || nowTs) : nowTs,
    status: params.status,
    elapsed,
    reco_ids: recoIds,
    roi,
    param,
    focus,
    images,
    order: existing?.order ?? params.eventOrder,
  })
}
