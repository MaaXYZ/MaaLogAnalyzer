<script setup lang="ts">
import { NDrawer, NDrawerContent } from 'naive-ui'
import DetailView from '../../DetailView.vue'
import type { NodeInfo } from '../../../types'
import type { BridgeOpenCropRequest } from '../composables/useBridgeTaskActions'

defineProps<{
  show: boolean
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
  'update:show': [value: boolean]
}>()

const handleUpdateShow = (value: boolean) => {
  emit('update:show', value)
}
</script>

<template>
  <n-drawer
    :show="show"
    placement="bottom"
    :default-height="400"
    resizable
    @update:show="handleUpdateShow"
  >
    <n-drawer-content title="详细信息">
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
    </n-drawer-content>
  </n-drawer>
</template>
