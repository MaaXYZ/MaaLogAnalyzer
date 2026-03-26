import { useProcessFileSelection } from './processView/fileSelection'
import { useProcessFollowNav } from './processView/followNav'
import { useProcessRuntimeLayout } from './processView/runtimeLayout'
import type { ProcessViewControllerEmitters, ProcessViewControllerProps } from './processView/types'

interface UseProcessViewControllerOptions {
  props: ProcessViewControllerProps
  emitters: ProcessViewControllerEmitters
}

export const useProcessViewController = (
  options: UseProcessViewControllerOptions,
) => {
  const runtimeLayout = useProcessRuntimeLayout(options.props)
  const followNav = useProcessFollowNav({
    props: options.props,
    emitters: options.emitters,
    isRealtimeStreaming: runtimeLayout.isRealtimeStreaming,
  })
  const fileSelection = useProcessFileSelection({
    emitters: options.emitters,
    isInTauri: runtimeLayout.isInTauri,
    isInVSCode: runtimeLayout.isInVSCode,
    virtualScroller: followNav.virtualScroller,
  })

  return {
    ...runtimeLayout,
    ...followNav,
    ...fileSelection,
  }
}
