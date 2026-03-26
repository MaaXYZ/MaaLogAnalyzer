import { computed, ref, type Ref } from 'vue'
import { isTauri, isVSCode } from '../../../utils/platform'
import { getSettings } from '../../../utils/settings'

interface UseProcessRuntimeContextOptions {
  isRealtimeStreaming: Ref<boolean | undefined>
  showRealtimeStatus: Ref<boolean | undefined>
  showReloadControls: Ref<boolean | undefined>
}

export const useProcessRuntimeContext = (options: UseProcessRuntimeContextOptions) => {
  const settings = getSettings()
  const isInTauri = ref(isTauri())
  const isInVSCode = ref(isVSCode())
  const isRealtimeStreaming = computed(() => options.isRealtimeStreaming.value === true)
  const showRealtimeStatus = computed(() => options.showRealtimeStatus.value === true)
  const showReloadControls = computed(() => options.showReloadControls.value === true)

  return {
    settings,
    isInTauri,
    isInVSCode,
    isRealtimeStreaming,
    showRealtimeStatus,
    showReloadControls,
  }
}
