<script setup lang="ts">
import {
  NCard, NDescriptions, NDescriptionsItem, NFlex, NTag,
  NCollapse, NCollapseItem, NButton, NIcon, NCode, NImage, NText,
} from 'naive-ui'
import { CopyOutlined } from '@vicons/antd'
import type { UnifiedFlowItem } from '../../../types'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'

const props = defineProps<{
  selectedFlowItem: UnifiedFlowItem | null
  selectedFlowExecutionTime: string
  descriptionColumns: number
  selectedFlowErrorImage: string | null
  getFlowTypeLabel: (type: UnifiedFlowItem['type']) => string
  rawJsonDefaultExpanded: string[]
  resolveImageSrc: (source: string) => string
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
}>()
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

      <n-descriptions-item label="子项数量">
        {{ props.selectedFlowItem.children?.length || 0 }}
      </n-descriptions-item>

    </n-descriptions>

    <div v-if="props.selectedFlowErrorImage" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">错误截图</n-text>
      <n-image :src="props.resolveImageSrc(props.selectedFlowErrorImage)" class="detail-preview-image" />
    </div>

    <n-collapse style="margin-top: 16px" :default-expanded-names="props.rawJsonDefaultExpanded">
      <n-collapse-item title="原始事件数据" name="task-json">
        <template #header-extra>
          <n-button
            size="tiny"
            @click.stop="props.copyToClipboard(props.formatJson(props.selectedFlowItem))"
          >
            <template #icon>
              <n-icon><copy-outlined /></n-icon>
            </template>
            复制
          </n-button>
        </template>
        <n-code
          :code="props.formatJson(props.selectedFlowItem)"
          language="json"
          :word-wrap="true"
          style="max-height: 500px; overflow: auto; max-width: 100%"
        />
      </n-collapse-item>
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
