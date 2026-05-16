<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  NCard, NDescriptions, NDescriptionsItem, NFlex, NTag,
  NCollapse, NText,
} from 'naive-ui'
import type { UnifiedFlowItem } from '../../../types'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'
import SafePreviewImage from '../../../components/SafePreviewImage.vue'
import RawJsonCollapseItem from './RawJsonCollapseItem.vue'

const props = defineProps<{
  selectedFlowItem: UnifiedFlowItem | null
  selectedFlowExecutionTime: string
  descriptionColumns: number
  selectedFlowErrorImage: string | null
  bridgeRecognitionDrawImages?: string[]
  bridgeRecognitionLoading?: boolean
  bridgeRecognitionError?: string | null
  getFlowTypeLabel: (type: UnifiedFlowItem['type']) => string
  rawJsonDefaultExpanded: string[]
  resolveImageSrc: (source: string) => string
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
}>()

const expandedNames = ref<string[]>([...props.rawJsonDefaultExpanded])
watch(
  () => props.rawJsonDefaultExpanded,
  (names) => {
    expandedNames.value = [...names]
  },
)
</script>

<template>
  <n-card v-if="props.selectedFlowItem" title="🧩 事件详情">
    <n-descriptions :column="props.descriptionColumns" size="small" label-placement="left" bordered>
      <n-descriptions-item label="名称" :span="props.descriptionColumns">
        <n-flex align="center" style="gap: 8px">
          <span style="font-weight: 500; font-size: 15px">
            {{ props.selectedFlowItem.name }}
          </span>
          <n-tag :type="getRuntimeStatusTagType(props.selectedFlowItem.status)" size="small">
            {{ getRuntimeStatusText(props.selectedFlowItem.status) }}
          </n-tag>
        </n-flex>
      </n-descriptions-item>

      <n-descriptions-item label="类型">
        {{ props.getFlowTypeLabel(props.selectedFlowItem.type) }}
      </n-descriptions-item>

      <n-descriptions-item label="执行时间">
        {{ props.selectedFlowExecutionTime }}
      </n-descriptions-item>

      <n-descriptions-item label="Task ID">
        {{ props.selectedFlowItem.task_id ?? '-' }}
      </n-descriptions-item>

      <n-descriptions-item label="节点 ID">
        {{ props.selectedFlowItem.node_id ?? '-' }}
      </n-descriptions-item>

      <n-descriptions-item
        v-if="props.selectedFlowItem.type === 'resource_loading'"
        label="资源 ID"
      >
        {{ props.selectedFlowItem.resource_loading_details?.res_id ?? '-' }}
      </n-descriptions-item>

      <n-descriptions-item
        v-if="props.selectedFlowItem.type === 'resource_loading'"
        label="资源类型"
      >
        {{ props.selectedFlowItem.resource_loading_details?.resource_type ?? '-' }}
      </n-descriptions-item>

      <n-descriptions-item label="子项数量">
        {{ props.selectedFlowItem.children?.length || 0 }}
      </n-descriptions-item>

      <n-descriptions-item
        v-if="props.selectedFlowItem.type === 'resource_loading' && props.selectedFlowItem.resource_loading_details?.path"
        label="资源路径"
        :span="props.descriptionColumns"
      >
        <n-text code>{{ props.selectedFlowItem.resource_loading_details.path }}</n-text>
      </n-descriptions-item>

      <n-descriptions-item
        v-if="props.selectedFlowItem.type === 'resource_loading' && props.selectedFlowItem.resource_loading_details?.hash"
        label="Hash"
        :span="props.descriptionColumns"
      >
        <n-text code>{{ props.selectedFlowItem.resource_loading_details.hash }}</n-text>
      </n-descriptions-item>

    </n-descriptions>

    <div v-if="props.selectedFlowErrorImage" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">错误截图</n-text>
      <safe-preview-image :src="props.resolveImageSrc(props.selectedFlowErrorImage)" class="detail-preview-image" />
    </div>

    <div
      v-if="props.selectedFlowItem.wait_freezes_details?.images && props.selectedFlowItem.wait_freezes_details.images.length > 0"
      style="margin-top: 12px"
    >
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">
        Wait Freezes 截图 ({{ props.selectedFlowItem.wait_freezes_details.images.length }})
      </n-text>
      <n-flex vertical style="gap: 8px">
        <safe-preview-image
          v-for="(img, idx) in props.selectedFlowItem.wait_freezes_details.images"
          :key="`wf-img-${idx}`"
          :src="props.resolveImageSrc(img)"
          class="detail-preview-image"
        />
      </n-flex>
    </div>

    <div
      v-if="props.selectedFlowItem.type === 'wait_freezes' && props.bridgeRecognitionLoading"
      style="margin-top: 12px"
    >
      <n-text depth="3" style="font-size: 13px">正在加载 Wait Freezes 调试图...</n-text>
    </div>

    <div
      v-if="props.selectedFlowItem.type === 'wait_freezes' && props.bridgeRecognitionError"
      style="margin-top: 12px"
    >
      <n-text type="error" style="font-size: 13px">{{ props.bridgeRecognitionError }}</n-text>
    </div>

    <div
      v-if="props.selectedFlowItem.type === 'wait_freezes' && props.bridgeRecognitionDrawImages && props.bridgeRecognitionDrawImages.length > 0"
      style="margin-top: 12px"
    >
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">
        Wait Freezes Draw ({{ props.bridgeRecognitionDrawImages.length }})
      </n-text>
      <n-flex vertical style="gap: 8px">
        <safe-preview-image
          v-for="(img, idx) in props.bridgeRecognitionDrawImages"
          :key="`wf-bridge-draw-${idx}`"
          :src="props.resolveImageSrc(img)"
          class="detail-preview-image"
        />
      </n-flex>
    </div>

    <n-collapse v-model:expanded-names="expandedNames" style="margin-top: 16px">
      <raw-json-collapse-item
        title="原始事件数据"
        name="task-json"
        :value="props.selectedFlowItem"
        :expanded-names="expandedNames"
        :format-json="props.formatJson"
        :copy-to-clipboard="props.copyToClipboard"
      />
    </n-collapse>
  </n-card>
</template>

<style scoped>
.detail-preview-image {
  display: block;
  max-width: 100%;
  width: 100%;
}

.detail-preview-image :deep(img) {
  display: block;
  max-width: 100%;
  width: 100%;
  height: auto;
  border-radius: 4px;
}
</style>
