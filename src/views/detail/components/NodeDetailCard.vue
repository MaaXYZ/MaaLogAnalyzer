<script setup lang="ts">
import {
  NCard, NDescriptions, NDescriptionsItem, NFlex, NTag, NIcon, NText,
  NCollapse, NCollapseItem, NButton, NCode, NEmpty, NImage,
} from 'naive-ui'
import { CopyOutlined } from '@vicons/antd'
import type { NodeInfo } from '../../../types'

const props = defineProps<{
  selectedNode: NodeInfo | null
  nodeErrorImage: string | null
  descriptionColumns: number
  statusType: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'
  statusInfo: {
    text: string
    icon: any
  }
  nodeExecutionTime: string
  showNodeCompletedRow: boolean
  nodeCompletedValue: boolean
  isVscodeLaunchEmbed: boolean
  formattedBridgeNodeDefinition: string
  bridgeNodeDefinitionLoading?: boolean
  bridgeNodeDefinitionError?: string | null
  rawJsonDefaultExpanded: string[]
  resolveImageSrc: (source: string) => string
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
}>()
</script>

<template>
  <n-card v-if="props.selectedNode">
    <template #header>
      📍 节点详情
    </template>
    <n-descriptions :column="props.descriptionColumns" size="small" label-placement="left" bordered>
      <n-descriptions-item label="节点名称" :span="props.descriptionColumns">
        <n-flex align="center" style="gap: 8px">
          <span style="font-weight: 500; font-size: 15px">
            {{ props.selectedNode.name }}
          </span>
          <n-tag :type="props.statusType" size="small">
            <template #icon>
              <n-icon :component="props.statusInfo.icon" v-if="props.statusInfo.icon" />
            </template>
            {{ props.statusInfo.text }}
          </n-tag>
        </n-flex>
      </n-descriptions-item>

      <n-descriptions-item label="执行时间">
        {{ props.nodeExecutionTime }}
      </n-descriptions-item>

      <n-descriptions-item label="节点 ID">
        {{ props.selectedNode.node_id }}
      </n-descriptions-item>

      <n-descriptions-item
        label="识别 ID"
        v-if="props.selectedNode.node_details && props.selectedNode.node_details.reco_id != null"
      >
        {{ props.selectedNode.node_details.reco_id }}
      </n-descriptions-item>

      <n-descriptions-item
        label="动作 ID"
        v-if="props.selectedNode.node_details && props.selectedNode.node_details.action_id != null"
      >
        {{ props.selectedNode.node_details.action_id }}
      </n-descriptions-item>

      <n-descriptions-item label="是否完成" v-if="props.showNodeCompletedRow">
        <n-tag :type="props.nodeCompletedValue ? 'success' : 'warning'" size="small">
          {{ props.nodeCompletedValue ? '已完成' : '未完成' }}
        </n-tag>
      </n-descriptions-item>

    </n-descriptions>

    <div v-if="props.nodeErrorImage" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">节点截图</n-text>
      <n-image
        :src="props.resolveImageSrc(props.nodeErrorImage)"
        class="detail-preview-image"
      />
    </div>

    <n-collapse style="margin-top: 16px" :default-expanded-names="props.rawJsonDefaultExpanded">
      <n-collapse-item v-if="props.isVscodeLaunchEmbed" title="节点定义" name="node-definition">
        <template #header-extra>
          <n-button
            v-if="props.formattedBridgeNodeDefinition"
            size="tiny"
            @click.stop="props.copyToClipboard(props.formattedBridgeNodeDefinition)"
          >
            <template #icon>
              <n-icon><copy-outlined /></n-icon>
            </template>
            复制
          </n-button>
        </template>
        <n-text v-if="props.bridgeNodeDefinitionLoading" depth="3" style="font-size: 13px">正在加载节点定义...</n-text>
        <n-text v-else-if="props.bridgeNodeDefinitionError" type="error" style="font-size: 13px">{{ props.bridgeNodeDefinitionError }}</n-text>
        <n-code
          v-else-if="props.formattedBridgeNodeDefinition"
          :code="props.formattedBridgeNodeDefinition"
          language="json"
          :word-wrap="true"
          style="max-height: 500px; overflow: auto; max-width: 100%"
        />
        <n-empty v-else description="未获取到节点定义" />
      </n-collapse-item>
      <n-collapse-item title="原始节点数据" name="node-json">
        <template #header-extra>
          <n-button
            size="tiny"
            @click.stop="props.copyToClipboard(props.formatJson(props.selectedNode))"
          >
            <template #icon>
              <n-icon><copy-outlined /></n-icon>
            </template>
            复制
          </n-button>
        </template>
        <n-code
          :code="props.formatJson(props.selectedNode)"
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
