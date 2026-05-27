<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NCard, NDescriptions, NDescriptionsItem, NTag,
  NText, NCollapse,
} from 'naive-ui'
import type { NodeInfo } from '../../../types'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'
import SafePreviewImage from '../../../components/SafePreviewImage.vue'
import RawJsonCollapseItem from './RawJsonCollapseItem.vue'
import { buildActionDetailRows, formatDetailValue } from './detailRows'

const props = defineProps<{
  currentActionDetails: any
  currentActionStatus: 'success' | 'failed' | 'running' | null
  actionErrorImage: string | null
  actionExecutionTime: string
  descriptionColumns: number
  selectedNode: NodeInfo | null
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

const actionDetailRows = computed(() => buildActionDetailRows(props.currentActionDetails, props.descriptionColumns))
</script>

<template>
  <n-card>
    <template #header>
      ⚡ 动作详情
    </template>
    <n-descriptions :column="props.descriptionColumns" size="small" label-placement="left" bordered>
      <n-descriptions-item label="动作 ID">
        {{ props.currentActionDetails?.action_id }}
      </n-descriptions-item>

      <n-descriptions-item label="动作类型">
        <n-tag size="small" :type="props.currentActionDetails?.action === 'DoNothing' ? 'default' : 'primary'">
          {{ props.currentActionDetails?.action || 'Unknown' }}
        </n-tag>
      </n-descriptions-item>

      <n-descriptions-item label="节点名称">
        {{ props.currentActionDetails?.name }}
      </n-descriptions-item>

      <n-descriptions-item label="执行结果">
        <n-tag :type="props.currentActionStatus ? getRuntimeStatusTagType(props.currentActionStatus) : 'default'" size="small">
          {{ props.currentActionStatus ? getRuntimeStatusText(props.currentActionStatus) : '-' }}
        </n-tag>
      </n-descriptions-item>

      <n-descriptions-item label="执行时间">
        {{ props.actionExecutionTime }}
      </n-descriptions-item>

      <n-descriptions-item label="目标位置" :span="props.descriptionColumns" v-if="props.currentActionDetails?.box">
        <n-text code>
          [{{ props.currentActionDetails.box.join(', ') }}]
        </n-text>
      </n-descriptions-item>

      <n-descriptions-item
        v-for="row in actionDetailRows"
        :key="row.label"
        :label="row.label"
        :span="row.span"
      >
        <n-text code class="detail-value">
          {{ formatDetailValue(row.value) }}
        </n-text>
      </n-descriptions-item>
    </n-descriptions>

    <div v-if="props.currentActionStatus === 'failed' && props.actionErrorImage" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">失败截图</n-text>
      <safe-preview-image
        :src="props.resolveImageSrc(props.actionErrorImage)"
        class="detail-preview-image"
      />
    </div>

    <n-collapse v-model:expanded-names="expandedNames" style="margin-top: 16px">
      <raw-json-collapse-item
        title="原始动作数据"
        name="action-json"
        :value="props.currentActionDetails"
        :expanded-names="expandedNames"
        :format-json="props.formatJson"
        :copy-to-clipboard="props.copyToClipboard"
        max-height="400px"
        default-expand-all
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

.detail-value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
