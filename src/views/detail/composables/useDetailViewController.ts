import { computed } from 'vue'
import type { NodeInfo, RecognitionAttempt, UnifiedFlowItem } from '../../../types'
import { useIsMobile } from '../../../composables/useIsMobile'
import { useDetailPresentationState } from './useDetailPresentationState'
import { useDetailFlowSelection } from './useDetailFlowSelection'
import { useDetailFlowDetails } from './useDetailFlowDetails'
import { useDetailBridgeRecognition } from './useDetailBridgeRecognition'
import { useDetailNodeDefinition } from './useDetailNodeDefinition'
import { useDetailUiHelpers } from './useDetailUiHelpers'
import {
  buildActionFocusCardData,
  buildNodeFocusCardData,
  buildRecognitionFocusCardData,
} from './focus'
import type { BridgeOpenCropRequest } from './types'
import { buildNodeFlowItems, buildNodeRecognitionAttempts } from '@windsland52/maa-log-parser/node-flow'

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
  const pickRecognitionErrorImage = (attempts: RecognitionAttempt[]): string | null => {
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
      const attempt = attempts[index]
      if (attempt.error_image) return attempt.error_image
      if (attempt.nested_nodes?.length) {
        const nested = pickRecognitionErrorImage(attempt.nested_nodes)
        if (nested) return nested
      }
    }
    return null
  }

  const pickFlowErrorImage = (items: UnifiedFlowItem[]): string | null => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      if (item.error_image) return item.error_image
      if (item.children?.length) {
        const nested = pickFlowErrorImage(item.children)
        if (nested) return nested
      }
    }
    return null
  }

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

  const selectedNodeDisplayErrorImage = computed(() => {
    const node = props.selectedNode
    if (!node) return null
    if (node.error_image) return node.error_image
    if (node.status !== 'failed') return null

    const recognitionErrorImage = pickRecognitionErrorImage(buildNodeRecognitionAttempts(node))
    if (recognitionErrorImage) return recognitionErrorImage

    return pickFlowErrorImage(buildNodeFlowItems(node))
  })

  const currentActionErrorImage = computed(() => {
    if (!currentActionItem.value) return null
    if (currentActionStatus.value !== 'failed') return null
    if (currentActionItem.value.error_image) return currentActionItem.value.error_image
    return props.selectedNode?.error_image ?? null
  })

  const currentFocusCard = computed(() => {
    if (currentRecognitionItem.value) {
      return buildRecognitionFocusCardData(currentRecognitionItem.value, props.selectedNode)
    }

    if (currentActionItem.value) {
      return buildActionFocusCardData(currentActionItem.value, props.selectedNode)
    }

    if (!isFlowItemSelected.value && props.selectedNode) {
      return buildNodeFocusCardData(props.selectedNode)
    }

    return null
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
    selectedNodeDisplayErrorImage,
    currentActionErrorImage,
    currentFocusCard,
  }
}
