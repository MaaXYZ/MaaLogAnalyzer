import { effectScope, nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskInfo } from '../../../../types'

const { buildFlowchartDataMock } = vi.hoisted(() => ({
  buildFlowchartDataMock: vi.fn(),
}))

vi.mock('../../../../utils/flowchartBuilder', () => ({
  buildFlowchartData: buildFlowchartDataMock,
}))

import { useFlowchartGraphRuntime } from '../useFlowchartGraphRuntime'

const makeTask = (startEventIndex: number): TaskInfo => ({
  task_id: 1,
  entry: 'FlowTask',
  hash: `hash-${startEventIndex}`,
  uuid: `uuid-${startEventIndex}`,
  start_time: '2026-07-26 12:00:00.000',
  status: 'running',
  nodes: [],
  events: [],
  _startEventIndex: startEventIndex,
})

const flushWatchers = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('useFlowchartGraphRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    buildFlowchartDataMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preserves interaction state and layout for refreshed projections of one task', async () => {
    const task = makeTask(10)
    const refreshedTask = { ...task, status: 'succeeded' as const }
    buildFlowchartDataMock.mockResolvedValue({
      nodes: [{ id: 'NodeA', position: { x: 10, y: 20 }, data: {} }],
      edges: [],
    })
    const selectedTask = ref<TaskInfo | null>(task)
    const flowNodes = ref<any[]>([])
    const flowEdges = ref<any[]>([])
    const focusedNodeId = ref<string | null>(null)
    const popoverNodeId = ref<string | null>(null)
    const selectedTimelineIndex = ref<number | null>(null)
    const stopPlayback = vi.fn()
    const closePopover = vi.fn()
    const fitView = vi.fn()
    const scope = effectScope()

    scope.run(() =>
      useFlowchartGraphRuntime({
        selectedTask,
        flowNodes,
        flowEdges,
        focusedNodeId,
        popoverNodeId,
        selectedTimelineIndex,
        isPlaying: ref(false),
        playbackIntervalMs: ref(900),
        focusZoom: ref(1),
        edgeStyle: ref('orthogonal'),
        edgeFlowEnabled: ref(true),
        ignoreUnexecutedNodes: ref(false),
        relayoutAfterDrag: ref(true),
        stopPlayback,
        startPlayback: vi.fn(),
        closePopover,
        fitView,
        updatePopoverPosition: vi.fn(),
        decorateInitialEdges: (edges) => edges,
        applyFocusStyles: vi.fn(),
        applyEdgeRenderTypes: vi.fn(),
        recomputeEdgeRoutesForCurrentNodes: vi.fn(),
        persistSettings: vi.fn(),
      }),
    )

    await flushWatchers()
    await vi.runAllTimersAsync()
    focusedNodeId.value = 'NodeA'
    selectedTimelineIndex.value = 0
    stopPlayback.mockClear()
    closePopover.mockClear()
    fitView.mockClear()

    selectedTask.value = refreshedTask
    await flushWatchers()
    await vi.runAllTimersAsync()

    expect(stopPlayback).not.toHaveBeenCalled()
    expect(closePopover).not.toHaveBeenCalled()
    expect(focusedNodeId.value).toBe('NodeA')
    expect(selectedTimelineIndex.value).toBe(0)
    expect(fitView).not.toHaveBeenCalled()
    expect(buildFlowchartDataMock).toHaveBeenLastCalledWith(
      refreshedTask,
      expect.objectContaining({
        previousNodes: flowNodes.value,
        previousEdges: flowEdges.value,
      }),
    )
    scope.stop()
  })

  it('does not commit an obsolete layout after selection is cleared', async () => {
    let resolveLayout!: (value: { nodes: any[]; edges: any[] }) => void
    buildFlowchartDataMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLayout = resolve
      }),
    )
    const selectedTask = ref<TaskInfo | null>(makeTask(10))
    const flowNodes = ref<any[]>([])
    const flowEdges = ref<any[]>([])
    const scope = effectScope()

    scope.run(() =>
      useFlowchartGraphRuntime({
        selectedTask,
        flowNodes,
        flowEdges,
        focusedNodeId: ref(null),
        popoverNodeId: ref(null),
        selectedTimelineIndex: ref(null),
        isPlaying: ref(false),
        playbackIntervalMs: ref(900),
        focusZoom: ref(1),
        edgeStyle: ref('orthogonal'),
        edgeFlowEnabled: ref(true),
        ignoreUnexecutedNodes: ref(false),
        relayoutAfterDrag: ref(true),
        stopPlayback: vi.fn(),
        startPlayback: vi.fn(),
        closePopover: vi.fn(),
        fitView: vi.fn(),
        updatePopoverPosition: vi.fn(),
        decorateInitialEdges: (edges) => edges,
        applyFocusStyles: vi.fn(),
        applyEdgeRenderTypes: vi.fn(),
        recomputeEdgeRoutesForCurrentNodes: vi.fn(),
        persistSettings: vi.fn(),
      }),
    )

    await nextTick()
    selectedTask.value = null
    await flushWatchers()
    resolveLayout({ nodes: [{ id: 'stale' }], edges: [{ id: 'stale-edge' }] })
    await flushWatchers()

    expect(flowNodes.value).toEqual([])
    expect(flowEdges.value).toEqual([])
    scope.stop()
  })

  const createRuntime = (selectedTask: Ref<TaskInfo | null>) => {
    const flowNodes = ref<any[]>([])
    const flowEdges = ref<any[]>([])
    const scope = effectScope()
    const runtime = scope.run(() =>
      useFlowchartGraphRuntime({
        selectedTask,
        flowNodes,
        flowEdges,
        focusedNodeId: ref<string | null>(null),
        popoverNodeId: ref<string | null>(null),
        selectedTimelineIndex: ref<number | null>(null),
        isPlaying: ref(false),
        playbackIntervalMs: ref(900),
        focusZoom: ref(1),
        edgeStyle: ref('orthogonal'),
        edgeFlowEnabled: ref(true),
        ignoreUnexecutedNodes: ref(false),
        relayoutAfterDrag: ref(true),
        stopPlayback: vi.fn(),
        startPlayback: vi.fn(),
        closePopover: vi.fn(),
        fitView: vi.fn(),
        updatePopoverPosition: vi.fn(),
        decorateInitialEdges: (edges) => edges,
        applyFocusStyles: vi.fn(),
        applyEdgeRenderTypes: vi.fn(),
        recomputeEdgeRoutesForCurrentNodes: vi.fn(),
        persistSettings: vi.fn(),
      }),
    )!

    return { runtime, flowNodes, scope }
  }

  it('exposes the loading state while the layout is pending', async () => {
    let resolveLayout!: (value: { nodes: any[]; edges: any[] }) => void
    buildFlowchartDataMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLayout = resolve
      }),
    )
    const selectedTask = ref<TaskInfo | null>(makeTask(10))
    const { runtime, flowNodes, scope } = createRuntime(selectedTask)

    await nextTick()
    expect(runtime.isLayouting.value).toBe(true)
    expect(runtime.layoutError.value).toBeNull()

    resolveLayout({ nodes: [{ id: 'NodeA' }], edges: [] })
    await flushWatchers()

    expect(runtime.isLayouting.value).toBe(false)
    expect(flowNodes.value).toHaveLength(1)
    scope.stop()
  })

  it('surfaces a layout failure and clears it on retry', async () => {
    buildFlowchartDataMock.mockRejectedValueOnce(new Error('elk chunk failed'))
    const selectedTask = ref<TaskInfo | null>(makeTask(10))
    const { runtime, flowNodes, scope } = createRuntime(selectedTask)

    await flushWatchers()

    expect(runtime.isLayouting.value).toBe(false)
    expect(runtime.layoutError.value).toBe('elk chunk failed')
    expect(flowNodes.value).toEqual([])

    buildFlowchartDataMock.mockResolvedValueOnce({ nodes: [{ id: 'NodeA' }], edges: [] })
    runtime.retryLayout()
    await flushWatchers()

    expect(runtime.layoutError.value).toBeNull()
    expect(flowNodes.value).toHaveLength(1)
    scope.stop()
  })
})
