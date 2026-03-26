<script setup lang="ts">
import { NTag, NImage } from 'naive-ui'
import type { NodeInfo } from '../../../types'
import { convertFileSrc } from '../utils/nodeImageLookup'

interface FlowchartPopoverData {
  label: string
  nodeInfos: NodeInfo[]
  executionOrder?: number[]
}

defineProps<{
  visible: boolean
  position: { x: number; y: number }
  popoverData: FlowchartPopoverData | null
  nodeImageMap: Map<number, string>
  getRuntimeStatusTagType: (status: NodeInfo['status']) => 'default' | 'error' | 'success' | 'warning' | 'info' | 'primary'
  getRuntimeStatusText: (status: NodeInfo['status']) => string
}>()

const emit = defineEmits<{
  close: []
  'navigate-to-node': [node: NodeInfo]
}>()
</script>

<template>
  <div
    v-if="visible && popoverData"
    class="node-popover"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
  >
    <div class="popover-header">
      <span class="popover-title">{{ popoverData.label }}</span>
      <span class="popover-close" @click="emit('close')">&times;</span>
    </div>
    <div class="popover-body">
      <div
        v-for="(info, idx) in popoverData.nodeInfos"
        :key="info.node_id"
      >
        <div v-if="popoverData.nodeInfos.length > 1" class="popover-exec-label">
          执行 #{{ popoverData.executionOrder?.[idx] ?? idx + 1 }}
        </div>
        <div class="popover-row">
          <n-tag size="tiny" :type="getRuntimeStatusTagType(info.status)">
            {{ getRuntimeStatusText(info.status) }}
          </n-tag>
          <span class="popover-time">{{ info.ts }}</span>
          <span class="popover-locate" @click="emit('navigate-to-node', info)">定位</span>
        </div>
        <div v-if="info.reco_details" class="popover-row">
          <span class="popover-label">识别</span>
          <span>{{ info.reco_details.algorithm }}</span>
          <span v-if="info.reco_details.box" class="popover-secondary">
            [{{ info.reco_details.box.join(', ') }}]
          </span>
        </div>
        <div v-if="info.action_details" class="popover-row">
          <span class="popover-label">动作</span>
          <span>{{ info.action_details.action }}</span>
          <n-tag size="tiny" :type="info.status === 'running' ? 'warning' : info.action_details.success ? 'success' : 'error'" style="margin-left: 4px">
            {{ info.status === 'running' ? getRuntimeStatusText(info.status) : info.action_details.success ? '成功' : '失败' }}
          </n-tag>
        </div>
        <n-image
          v-if="nodeImageMap.get(info.node_id)"
          :src="convertFileSrc(nodeImageMap.get(info.node_id)!)"
          class="popover-img"
        />
        <div
          v-if="idx < popoverData.nodeInfos.length - 1"
          class="popover-divider"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-popover {
  position: absolute;
  z-index: 20;
  width: 280px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  background: var(--flowchart-popover-bg);
  border: 1px solid var(--flowchart-popover-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--flowchart-popover-border);
  flex-shrink: 0;
}

.popover-title {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.popover-close {
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: var(--flowchart-popover-close);
  margin-left: 8px;
  flex-shrink: 0;
}

.popover-close:hover {
  color: var(--flowchart-popover-close-hover);
}

.popover-body {
  padding: 8px 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.popover-exec-label {
  font-weight: 600;
  font-size: 11px;
  color: var(--flowchart-badge-text);
  margin-bottom: 4px;
}

.popover-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.popover-time {
  color: var(--flowchart-popover-secondary);
  font-size: 11px;
}

.popover-locate {
  font-size: 11px;
  color: #18a058;
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
}

.popover-locate:hover {
  text-decoration: underline;
}

.popover-label {
  font-weight: 500;
  color: var(--flowchart-popover-secondary);
  flex-shrink: 0;
}

.popover-secondary {
  color: var(--flowchart-popover-secondary);
  font-size: 11px;
}

.popover-divider {
  border-bottom: 1px solid var(--flowchart-popover-border);
  margin: 6px 0;
}

.popover-img {
  display: block;
  max-width: 100%;
  width: 100%;
  margin-top: 4px;
}

.popover-img :deep(img) {
  display: block;
  max-width: 100%;
  width: 100%;
  height: auto;
  border-radius: 4px;
}
</style>
