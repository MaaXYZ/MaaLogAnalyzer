import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useFlowchartPlayback } from '../useFlowchartPlayback'

describe('useFlowchartPlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('restarts from the first item after playback reaches the end', () => {
    const selectedTimelineIndex = ref<number | null>(null)
    const playback = useFlowchartPlayback({
      executionTimeline: ref([{ name: 'First' }, { name: 'Last' }]),
      selectedTimelineIndex,
      focusedNodeId: ref<string | null>(null),
      showNavDrawer: ref(false),
      isMobile: ref(false),
      focusZoom: ref(1),
      playbackIntervalMs: ref(100),
      getNodeById: () => null,
      centerOnNode: vi.fn(),
      popoverNodeId: ref<string | null>(null),
      updatePopoverPosition: vi.fn(),
      closePopover: vi.fn(),
      scrollNavToIndex: vi.fn(),
    })

    playback.startPlayback()
    expect(selectedTimelineIndex.value).toBe(0)

    vi.advanceTimersByTime(100)
    expect(selectedTimelineIndex.value).toBe(1)
    vi.advanceTimersByTime(100)
    expect(playback.isPlaying.value).toBe(false)

    playback.startPlayback()
    expect(playback.isPlaying.value).toBe(true)
    expect(selectedTimelineIndex.value).toBe(0)
  })
})
