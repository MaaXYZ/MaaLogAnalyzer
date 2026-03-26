<script setup lang="ts">
import { NCard, NButton } from 'naive-ui'
import DetailView from '../../DetailView.vue'
import type { NodeInfo } from '../../../types'
import type { BridgeOpenCropRequest } from '../composables/useBridgeTaskActions'

defineProps<{
  title: string
  selectedNode: NodeInfo | null
  selectedFlowItemId: string | null
  bridgeRecognitionImages: {
    raw: string | null
    draws: string[]
  } | null
  bridgeRecognitionImageRefs: {
    raw: number | null
    draws: number[]
  } | null
  bridgeRecognitionLoading: boolean
  bridgeRecognitionError: string | null
  isVscodeLaunchEmbed: boolean
  bridgeNodeDefinition: string | null
  bridgeNodeDefinitionLoading: boolean
  bridgeNodeDefinitionError: string | null
  bridgeOpenCrop: ((request: BridgeOpenCropRequest) => Promise<void>) | null
}>()

const emit = defineEmits<{
  'toggle-collapse': []
}>()

const handleToggleCollapse = () => {
  emit('toggle-collapse')
}
</script>

<template>
  <n-card
    class="detail-shell-card"
    size="small"
    :title="title"
    :bordered="false"
    style="height: 100%; display: flex; flex-direction: column; position: relative"
    content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden"
  >
    <n-button
      size="tiny"
      secondary
      strong
      @click="handleToggleCollapse"
      style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); z-index: 100; height: 86px; min-width: 24px; padding: 6px 4px; border-top-left-radius: 0; border-bottom-left-radius: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
    >
      <span style="writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 1px; font-size: 12px; line-height: 1">详情</span>
    </n-button>
    <detail-view
      :selected-node="selectedNode"
      :selected-flow-item-id="selectedFlowItemId"
      :bridge-recognition-images="bridgeRecognitionImages"
      :bridge-recognition-image-refs="bridgeRecognitionImageRefs"
      :bridge-recognition-loading="bridgeRecognitionLoading"
      :bridge-recognition-error="bridgeRecognitionError"
      :is-vscode-launch-embed="isVscodeLaunchEmbed"
      :bridge-node-definition="bridgeNodeDefinition"
      :bridge-node-definition-loading="bridgeNodeDefinitionLoading"
      :bridge-node-definition-error="bridgeNodeDefinitionError"
      :bridge-open-crop="bridgeOpenCrop"
      style="height: 100%"
    />
  </n-card>
</template>

<style scoped>
:deep(.detail-shell-card.n-card) {
  background-color: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
</style>
