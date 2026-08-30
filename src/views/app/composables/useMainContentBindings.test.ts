import { describe, expect, it, vi } from 'vitest'
import { computed, ref, shallowRef } from 'vue'
import type { LogParser } from '@windsland52/maa-log-parser'
import type { TaskInfo } from '../../../types'
import { useMainContentBindings } from './useMainContentBindings'

describe('useMainContentBindings realtime status', () => {
  it('uses active streaming state instead of retained realtime context', () => {
    const realtimeStreaming = ref(false)
    const realtimeParseFailed = ref(false)
    const bindings = useMainContentBindings({
      filteredTasks: shallowRef<TaskInfo[]>([]),
      selectedTask: shallowRef(null),
      selectedNode: shallowRef(null),
      selectedFlowItemId: ref(null),
      loading: ref(false),
      parser: {} as LogParser,
      isVscodeLaunchEmbed: true,
      bridgeRequestTaskDoc: null,
      bridgeRevealTask: null,
      pendingScrollNodeId: ref(null),
      followLast: ref(true),
      realtimeStreaming,
      realtimeParseFailed,
      showRealtimeStatus: true,
      showReloadControls: false,
      detailViewCollapsed: ref(false),
      toggleDetailView: vi.fn(),
      bridgeRecognitionImages: shallowRef(null),
      bridgeRecognitionImageRefs: shallowRef(null),
      bridgeRecognitionLoading: ref(false),
      bridgeRecognitionError: ref(null),
      bridgeNodeDefinition: ref(null),
      bridgeNodeDefinitionLoading: ref(false),
      bridgeNodeDefinitionError: ref(null),
      bridgeOpenCrop: null,
      isDark: computed(() => false),
      textSearchLoadedTargets: ref([]),
      textSearchLoadedDefaultTargetId: ref('realtime:finished-session'),
      hasDeferredTextSearchTargets: ref(false),
      ensureTextSearchTargetsHydrated: undefined,
      handleSelectTask: vi.fn(),
      handleSearchNodeInSource: vi.fn(),
      pendingTextSearchRequest: ref(null),
      consumeTextSearchRequest: vi.fn(),
      ensureDeferredTargetContent: vi.fn(),
      findDeferredTargetWithContent: vi.fn(),
      handleFileUpload: vi.fn(),
      handleContentUpload: vi.fn(),
      handleSelectNode: vi.fn(),
      handleSelectAction: vi.fn(),
      handleSelectRecognition: vi.fn(),
      handleSelectFlowItem: vi.fn(),
      handleFileLoadingStart: vi.fn(),
      handleFileLoadingEnd: vi.fn(),
      showTaskDrawer: ref(false),
    })

    expect(bindings.processViewMobileProps.value.isRealtimeStreaming).toBe(false)
    expect(bindings.processViewMobileProps.value.realtimeParseFailed).toBe(false)

    realtimeStreaming.value = true
    realtimeParseFailed.value = true
    expect(bindings.processViewMobileProps.value.isRealtimeStreaming).toBe(true)
    expect(bindings.processViewMobileProps.value.realtimeParseFailed).toBe(true)
  })
})
