<script setup lang="ts">
import {
  NCard, NFlex, NScrollbar, NEmpty,
} from 'naive-ui'
import type { NodeInfo } from '../types'
import { useDetailViewController } from './detail/composables/useDetailViewController'
import type { BridgeOpenCropRequest } from './detail/composables/types'
import RecognitionDetailCard from './detail/components/RecognitionDetailCard.vue'
import ActionDetailCard from './detail/components/ActionDetailCard.vue'
import FlowFallbackCard from './detail/components/FlowFallbackCard.vue'
import NodeDetailCard from './detail/components/NodeDetailCard.vue'

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
  openRecognitionInCrop,
  formattedBridgeNodeDefinition,
} = useDetailViewController(props)
</script>

<template>
  <n-scrollbar style="height: 100%">
    <div style="padding: 20px">
      <n-flex vertical style="gap: 16px">

      <!-- 未选择节点提示 -->
      <n-card v-if="!selectedNode" title="节点详情">
        <n-empty description="请点击左侧节点查看详情" />
      </n-card>

      <!-- 已选择节点 -->
      <template v-else>

        <!-- 识别详情 -->
        <recognition-detail-card
          v-if="hasRecognition"
          :current-recognition="currentRecognition"
          :current-attempt="currentAttempt"
          :description-columns="descriptionColumns"
          :recognition-execution-time="recognitionExecutionTime"
          :is-vscode-launch-embed="isVscodeLaunchEmbed"
          :bridge-recognition-raw-image="bridgeRecognitionRawImage"
          :bridge-recognition-image-refs="bridgeRecognitionImageRefs"
          :bridge-recognition-loading="bridgeRecognitionLoading"
          :bridge-recognition-error="bridgeRecognitionError"
          :bridge-recognition-draw-images="bridgeRecognitionDrawImages"
          :raw-json-default-expanded="rawJsonDefaultExpanded"
          :resolve-image-src="resolveImageSrc"
          :format-json="formatJson"
          :copy-to-clipboard="copyToClipboard"
          :open-recognition-in-crop="openRecognitionInCrop"
        />

        <!-- 动作详情 -->
        <action-detail-card
          v-if="hasAction"
          :current-action-details="currentActionDetails"
          :current-action-status="currentActionStatus"
          :action-execution-time="actionExecutionTime"
          :description-columns="descriptionColumns"
          :selected-node="selectedNode"
          :raw-json-default-expanded="rawJsonDefaultExpanded"
          :resolve-image-src="resolveImageSrc"
          :format-json="formatJson"
          :copy-to-clipboard="copyToClipboard"
        />

        <!-- Flow fallback（无识别/动作详情时显示基本信息） -->
        <flow-fallback-card
          v-if="showFlowFallback && selectedFlowItem"
          :selected-flow-item="selectedFlowItem"
          :selected-flow-execution-time="selectedFlowExecutionTime"
          :description-columns="descriptionColumns"
          :selected-flow-error-image="selectedFlowErrorImage"
          :get-flow-type-label="getFlowTypeLabel"
          :raw-json-default-expanded="rawJsonDefaultExpanded"
          :resolve-image-src="resolveImageSrc"
          :format-json="formatJson"
          :copy-to-clipboard="copyToClipboard"
        />

        <!-- 节点详情 (仅在点击节点名称时显示) -->
        <node-detail-card
          v-if="!isFlowItemSelected"
          :selected-node="selectedNode"
          :description-columns="descriptionColumns"
          :status-type="statusType"
          :status-info="statusInfo"
          :node-execution-time="nodeExecutionTime"
          :show-node-completed-row="showNodeCompletedRow"
          :node-completed-value="nodeCompletedValue"
          :is-vscode-launch-embed="isVscodeLaunchEmbed"
          :formatted-bridge-node-definition="formattedBridgeNodeDefinition"
          :bridge-node-definition-loading="bridgeNodeDefinitionLoading"
          :bridge-node-definition-error="bridgeNodeDefinitionError"
          :raw-json-default-expanded="rawJsonDefaultExpanded"
          :resolve-image-src="resolveImageSrc"
          :format-json="formatJson"
          :copy-to-clipboard="copyToClipboard"
        />

      </template>
      </n-flex>
    </div>
  </n-scrollbar>
</template>

<style scoped>
/* Fix Naive UI scrollbar container background in light mode */
:deep(.n-scrollbar-container) {
  background-color: transparent !important;
}

:deep(.n-scrollbar-content) {
  background-color: transparent !important;
}

:deep(.n-card__content) {
  background-color: transparent !important;
}

:deep(.n-descriptions-table-wrapper) {
  background: transparent;
}

@media (max-width: 768px) {
  :deep(.n-descriptions-table-wrapper) {
    font-size: 13px;
  }
}
</style>
