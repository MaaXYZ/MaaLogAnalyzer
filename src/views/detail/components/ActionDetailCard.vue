<script setup lang="ts">
import {
  NCard, NDescriptions, NDescriptionsItem, NTag,
  NText, NFlex, NCollapse, NCollapseItem, NButton, NIcon, NCode, NImage,
} from 'naive-ui'
import { CopyOutlined } from '@vicons/antd'
import type { NodeInfo } from '../../../types'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'

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
    </n-descriptions>

    <div v-if="props.selectedNode?.wait_freezes_images?.length" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">Wait Freezes 截图 ({{ props.selectedNode.wait_freezes_images.length }})</n-text>
      <n-flex vertical style="gap: 8px">
        <n-image
          v-for="(img, idx) in props.selectedNode.wait_freezes_images"
          :key="idx"
          :src="props.resolveImageSrc(img)"
          class="detail-preview-image"
        />
      </n-flex>
    </div>

    <div v-if="props.currentActionStatus === 'failed' && props.actionErrorImage" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">失败截图</n-text>
      <n-image
        :src="props.resolveImageSrc(props.actionErrorImage)"
        class="detail-preview-image"
      />
    </div>

    <n-collapse style="margin-top: 16px" :default-expanded-names="props.rawJsonDefaultExpanded">
      <n-collapse-item title="原始动作数据" name="action-json">
        <template #header-extra>
          <n-button
            size="tiny"
            @click.stop="props.copyToClipboard(props.formatJson(props.currentActionDetails))"
          >
            <template #icon>
              <n-icon><copy-outlined /></n-icon>
            </template>
            复制
          </n-button>
        </template>
        <n-code
          :code="props.formatJson(props.currentActionDetails)"
          language="json"
          :word-wrap="true"
          style="max-height: 400px; overflow: auto; max-width: 100%"
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
