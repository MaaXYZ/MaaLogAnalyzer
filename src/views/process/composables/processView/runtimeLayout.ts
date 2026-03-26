import { computed } from 'vue'
import { useProcessLayout } from '../useProcessLayout'
import { useProcessRuntimeContext } from '../useProcessRuntimeContext'
import type { ProcessViewControllerProps } from './types'

export const useProcessRuntimeLayout = (
  props: ProcessViewControllerProps,
) => {
  const {
    settings,
    isInTauri,
    isInVSCode,
    isRealtimeStreaming,
    showRealtimeStatus,
    showReloadControls,
  } = useProcessRuntimeContext({
    isRealtimeStreaming: computed(() => props.isRealtimeStreaming),
    showRealtimeStatus: computed(() => props.showRealtimeStatus),
    showReloadControls: computed(() => props.showReloadControls),
  })

  const {
    taskListCollapsed,
    taskListSize,
    nodeNavCollapsed,
    nodeNavSize,
    toggleTaskList,
    toggleNodeNav,
  } = useProcessLayout({
    detailViewCollapsed: computed(() => props.detailViewCollapsed),
    displayMode: computed(() => settings.displayMode),
  })

  return {
    settings,
    isInTauri,
    isInVSCode,
    isRealtimeStreaming,
    showRealtimeStatus,
    showReloadControls,
    taskListCollapsed,
    taskListSize,
    nodeNavCollapsed,
    nodeNavSize,
    toggleTaskList,
    toggleNodeNav,
  }
}
