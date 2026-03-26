import { computed } from 'vue'
import type { NodeInfo } from '../../../types'
import { useIsMobile } from '../../../composables/useIsMobile'
import { useDetailPresentationState } from './useDetailPresentationState'
import { useDetailFlowSelection } from './useDetailFlowSelection'
import { useDetailFlowDetails } from './useDetailFlowDetails'
import { useDetailBridgeRecognition } from './useDetailBridgeRecognition'
import { useDetailNodeDefinition } from './useDetailNodeDefinition'
import { useDetailUiHelpers } from './useDetailUiHelpers'
import type { BridgeOpenCropRequest } from './types'

interface DetailViewControllerProps {
  selectedNode: NodeInfo | null
  selectedFlowItemId?: string | null
  bridgeRecognitionImages?: {
    raw: string | null
    draws: string[]
  } | null
  bridgeRecognitionImageRefs?: {
    raw: number | null
    draws: number[]
  } | null
  bridgeRecognitionLoading?: boolean
  bridgeRecognitionError?: string | null
  isVscodeLaunchEmbed?: boolean
  bridgeNodeDefinition?: string | null
  bridgeNodeDefinitionLoading?: boolean
  bridgeNodeDefinitionError?: string | null
  bridgeOpenCrop?: ((request: BridgeOpenCropRequest) => Promise<void>) | null
}

export const useDetailViewController = (
  props: DetailViewControllerProps,
) => {
  const { isMobile } = useIsMobile()
  const {
    rawJsonDefaultExpanded,
    resolveImageSrc,
    formatJson,
    copyToClipboard,
  } = useDetailUiHelpers()

  const {
    selectedFlowItem,
    isFlowItemSelected,
    selectedFlowErrorImage,
  } = useDetailFlowSelection({
    selectedNode: computed(() => props.selectedNode),
    selectedFlowItemId: computed(() => props.selectedFlowItemId),
  })

  const {
    currentRecognitionItem,
    currentAttempt,
    currentRecognition,
    hasRecognition,
    currentActionItem,
    currentActionDetails,
    hasAction,
    currentActionStatus,
  } = useDetailFlowDetails({
    selectedFlowItem,
  })

  const {
    statusType,
    statusInfo,
    recognitionExecutionTime,
    actionExecutionTime,
    selectedFlowExecutionTime,
    nodeExecutionTime,
    showFlowFallback,
    getFlowTypeLabel,
    showNodeCompletedRow,
    nodeCompletedValue,
    descriptionColumns,
  } = useDetailPresentationState({
    isMobile,
    selectedNode: computed(() => props.selectedNode),
    selectedFlowItem,
    currentRecognitionItem,
    currentActionItem,
    currentActionDetails,
    hasRecognition,
    hasAction,
  })

  const {
    isVscodeLaunchEmbed,
    bridgeRecognitionRawImage,
    bridgeRecognitionDrawImages,
    openRecognitionInCrop,
  } = useDetailBridgeRecognition({
    isVscodeLaunchEmbed: computed(() => props.isVscodeLaunchEmbed),
    bridgeOpenCrop: computed(() => props.bridgeOpenCrop),
    bridgeRecognitionImages: computed(() => props.bridgeRecognitionImages),
    bridgeRecognitionImageRefs: computed(() => props.bridgeRecognitionImageRefs),
    currentRecognition,
    currentRecognitionItem,
    selectedNode: computed(() => props.selectedNode),
  })

  const {
    formattedBridgeNodeDefinition,
  } = useDetailNodeDefinition({
    bridgeNodeDefinition: computed(() => props.bridgeNodeDefinition),
  })

  return {
    rawJsonDefaultExpanded,
    resolveImageSrc,
    formatJson,
    copyToClipboard,
    selectedFlowItem,
    isFlowItemSelected,
    selectedFlowErrorImage,
    currentRecognitionItem,
    currentAttempt,
    currentRecognition,
    hasRecognition,
    currentActionItem,
    currentActionDetails,
    hasAction,
    currentActionStatus,
    statusType,
    statusInfo,
    recognitionExecutionTime,
    actionExecutionTime,
    selectedFlowExecutionTime,
    nodeExecutionTime,
    showFlowFallback,
    getFlowTypeLabel,
    showNodeCompletedRow,
    nodeCompletedValue,
    descriptionColumns,
    isVscodeLaunchEmbed,
    bridgeRecognitionRawImage,
    bridgeRecognitionDrawImages,
    openRecognitionInCrop,
    formattedBridgeNodeDefinition,
  }
}
