<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { NCard, NFlex, NScrollbar, NEmpty } from 'naive-ui'
import type { ScrollbarInst } from 'naive-ui'
import type { NodeInfo } from '../types'
import { useDetailViewController } from './detail/composables/useDetailViewController'
import type { BridgeOpenCropRequest } from './detail/composables/types'
import RecognitionDetailCard from './detail/components/RecognitionDetailCard.vue'
import ActionDetailCard from './detail/components/ActionDetailCard.vue'
import FlowFallbackCard from './detail/components/FlowFallbackCard.vue'
import NodeDetailCard from './detail/components/NodeDetailCard.vue'
import FocusDetailCard from './detail/components/FocusDetailCard.vue'

const props = defineProps<{
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
  onSearchInSource?: (keyword: string, locate?: string) => void
}>()

const {
  rawJsonDefaultExpanded,
  resolveImageSrc,
  formatJson,
  copyToClipboard,
  selectedFlowItem,
  isFlowItemSelected,
  selectedFlowErrorImage,
  currentAttempt,
  currentRecognition,
  hasRecognition,
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
  showOpenCropButton,
  openCropImageAvailable,
  openRecognitionInCrop,
  openSelectedFlowErrorInCrop,
  openCurrentActionErrorInCrop,
  openSelectedNodeErrorInCrop,
  formattedBridgeNodeDefinition,
  selectedNodeDisplayErrorImage,
  currentActionErrorImage,
  currentFocusCard,
} = useDetailViewController(props)

// 1. 创建滚动条的引用
const scrollbarRef = ref<ScrollbarInst | null>(null)

// 2. 仅当选中项的"身份"发生变化时才回顶，避免实时模式下同一节点更新导致频繁跳顶
watch(
  [() => props.selectedNode?.node_id, () => props.selectedFlowItemId],
  ([newNodeId, newFlowId], [oldNodeId, oldFlowId]) => {
    if (newNodeId === oldNodeId && newFlowId === oldFlowId) return
    nextTick(() => {
      scrollbarRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  },
)
</script>

<template>
  <n-scrollbar ref="scrollbarRef" style="height: 100%">
    <div class="detail-inspector-container">
      <n-flex vertical style="gap: 12px">
        <n-card v-if="!selectedNode" title="节点详情" size="small">
          <n-empty description="请在时间线或节点导航中选择节点查看详情" />
        </n-card>

        <template v-else>
          <focus-detail-card
            v-if="currentFocusCard"
            :focus-card="currentFocusCard"
            :raw-json-default-expanded="rawJsonDefaultExpanded"
            :format-json="formatJson"
            :copy-to-clipboard="copyToClipboard"
          />

          <recognition-detail-card
            v-if="hasRecognition"
            class="inspector-card"
            :current-recognition="currentRecognition"
            :current-attempt="currentAttempt"
            :description-columns="descriptionColumns"
            :recognition-execution-time="recognitionExecutionTime"
            :is-vscode-launch-embed="isVscodeLaunchEmbed"
            :bridge-recognition-raw-image="bridgeRecognitionRawImage"
            :bridge-recognition-image-refs="props.bridgeRecognitionImageRefs"
            :bridge-recognition-loading="bridgeRecognitionLoading"
            :bridge-recognition-error="bridgeRecognitionError"
            :bridge-recognition-draw-images="bridgeRecognitionDrawImages"
            :show-open-crop-button="showOpenCropButton"
            :open-crop-image-available="openCropImageAvailable"
            :raw-json-default-expanded="rawJsonDefaultExpanded"
            :resolve-image-src="resolveImageSrc"
            :format-json="formatJson"
            :copy-to-clipboard="copyToClipboard"
            :open-recognition-in-crop="openRecognitionInCrop"
            :on-search-in-source="props.onSearchInSource"
          />

          <action-detail-card
            v-if="hasAction"
            class="inspector-card"
            :current-action-details="currentActionDetails"
            :current-action-status="currentActionStatus"
            :action-error-image="currentActionErrorImage"
            :action-execution-time="actionExecutionTime"
            :description-columns="descriptionColumns"
            :selected-node="selectedNode"
            :raw-json-default-expanded="rawJsonDefaultExpanded"
            :resolve-image-src="resolveImageSrc"
            :format-json="formatJson"
            :copy-to-clipboard="copyToClipboard"
            :show-open-crop-button="showOpenCropButton"
            :open-error-image-in-crop="openCurrentActionErrorInCrop"
            :on-search-in-source="props.onSearchInSource"
          />

          <flow-fallback-card
            v-if="showFlowFallback && selectedFlowItem"
            class="inspector-card"
            :selected-flow-item="selectedFlowItem"
            :selected-flow-execution-time="selectedFlowExecutionTime"
            :description-columns="descriptionColumns"
            :selected-flow-error-image="selectedFlowErrorImage"
            :bridge-recognition-draw-images="bridgeRecognitionDrawImages"
            :bridge-recognition-loading="props.bridgeRecognitionLoading"
            :bridge-recognition-error="props.bridgeRecognitionError"
            :get-flow-type-label="getFlowTypeLabel"
            :raw-json-default-expanded="rawJsonDefaultExpanded"
            :resolve-image-src="resolveImageSrc"
            :format-json="formatJson"
            :copy-to-clipboard="copyToClipboard"
            :show-open-crop-button="showOpenCropButton"
            :open-error-image-in-crop="openSelectedFlowErrorInCrop"
          />

          <node-detail-card
            v-if="!isFlowItemSelected"
            class="inspector-card"
            :selected-node="selectedNode"
            :node-error-image="selectedNodeDisplayErrorImage"
            :description-columns="descriptionColumns"
            :status-type="statusType"
            :status-info="statusInfo"
            :node-execution-time="nodeExecutionTime"
            :show-node-completed-row="showNodeCompletedRow"
            :node-completed-value="nodeCompletedValue"
            :is-vscode-launch-embed="isVscodeLaunchEmbed"
            :formatted-bridge-node-definition="formattedBridgeNodeDefinition"
            :bridge-node-definition-loading="props.bridgeNodeDefinitionLoading"
            :bridge-node-definition-error="props.bridgeNodeDefinitionError"
            :raw-json-default-expanded="rawJsonDefaultExpanded"
            :resolve-image-src="resolveImageSrc"
            :format-json="formatJson"
            :copy-to-clipboard="copyToClipboard"
            :show-open-crop-button="showOpenCropButton"
            :open-error-image-in-crop="openSelectedNodeErrorInCrop"
            :on-search-in-source="props.onSearchInSource"
          />
        </template>
      </n-flex>
    </div>
  </n-scrollbar>
</template>

<style scoped>
.detail-inspector-container {
  padding: 12px; /* 减小外边距 */
}

/* 核心：将详情页卡片打造成 Inspector 风格 */
:deep(.n-card.inspector-card) {
  border: 1px solid var(--n-border-color);
  background-color: var(--n-color-modal);
}

/* 实现卡片标题吸顶，方便在查看长数据时辨认模块 */
:deep(.n-card.inspector-card > .n-card-header) {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--n-color-modal); /* 配合背景颜色 */
  padding: 8px 12px;
  border-bottom: 1px solid var(--n-border-color);
}

:deep(.n-card__content) {
  padding: 12px !important;
}

/* 图片自适应：确保详情面板中的大图能够填满宽度 */
:deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

/* 针对描述列表的紧凑化处理 */
:deep(.n-descriptions-table-content) {
  padding: 4px 8px !important;
  font-size: 13px;
}

:deep(.n-scrollbar-container) {
  background-color: transparent !important;
}
</style>
