<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NTag } from 'naive-ui'
import type { NodeInfo } from '../../../types'
import { convertFileSrc } from '../utils/nodeImageLookup'
import SafePreviewImage from '../../../components/SafePreviewImage.vue'

interface FlowchartPopoverData {
  label: string
  nodeInfos: NodeInfo[]
  executionOrder?: number[]
}

const props = defineProps<{
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

interface PopoverExecutionEntry {
  info: NodeInfo
  executionOrder: number
}

const showAbnormalOnly = ref(false)

const hasFailedAction = (info: NodeInfo): boolean => {
  if (info.action_details && info.action_details.success === false) return true
  return (info.node_flow || []).some(
    (item) => (item.type === 'action' || item.type === 'action_node') && item.status === 'failed'
  )
}

const isAbnormalExecution = (info: NodeInfo): boolean => {
  return info.status === 'failed' || hasFailedAction(info)
}

const hasAbnormalEntries = computed(() => {
  const data = props.popoverData
  if (!data) return false
  return data.nodeInfos.some((info) => isAbnormalExecution(info))
})

const popoverEntries = computed<PopoverExecutionEntry[]>(() => {
  const data = props.popoverData
  if (!data) return []

  const entries = data.nodeInfos.map((info, idx) => ({
    info,
    executionOrder: data.executionOrder?.[idx] ?? idx + 1,
  }))

  if (!showAbnormalOnly.value) return entries
  return entries.filter((entry) => isAbnormalExecution(entry.info))
})

const toggleAbnormalOnly = () => {
  if (!hasAbnormalEntries.value) return
  showAbnormalOnly.value = !showAbnormalOnly.value
}

watch(
  () => props.popoverData,
  () => {
    showAbnormalOnly.value = false
  }
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      showAbnormalOnly.value = false
    }
  }
)
</script>

<template>
  <div
    v-if="visible && popoverData"
    class="node-popover"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
  >
    <div class="popover-header">
      <span class="popover-title">{{ popoverData.label }}</span>
      <button
        class="popover-filter-btn"
        type="button"
        :title="showAbnormalOnly ? '仅显示异常执行（点击显示全部）' : '显示全部执行（点击仅异常）'"
        :disabled="!hasAbnormalEntries"
        @click="toggleAbnormalOnly"
      >
        <span class="popover-filter-dot" :class="{ 'popover-filter-dot--active': showAbnormalOnly }" />
      </button>
      <span class="popover-close" @click="emit('close')">&times;</span>
    </div>
    <div class="popover-body">
      <div v-if="popoverEntries.length === 0" class="popover-empty">
        暂无异常执行
      </div>
      <div
        v-for="(entry, idx) in popoverEntries"
        :key="`${entry.executionOrder}-${entry.info.node_id}-${idx}`"
      >
        <div v-if="popoverData.nodeInfos.length > 1" class="popover-exec-label">
          执行 #{{ entry.executionOrder }}
        </div>
        <div class="popover-row">
          <n-tag size="tiny" :type="getRuntimeStatusTagType(entry.info.status)">
            {{ getRuntimeStatusText(entry.info.status) }}
          </n-tag>
          <span class="popover-time">{{ entry.info.ts }}</span>
          <span class="popover-locate" @click="emit('navigate-to-node', entry.info)">定位</span>
        </div>
        <div v-if="entry.info.reco_details" class="popover-row">
          <span class="popover-label">识别</span>
          <span>{{ entry.info.reco_details.algorithm }}</span>
          <span v-if="entry.info.reco_details.box" class="popover-secondary">
            [{{ entry.info.reco_details.box.join(', ') }}]
          </span>
        </div>
        <div v-if="entry.info.action_details" class="popover-row">
          <span class="popover-label">动作</span>
          <span>{{ entry.info.action_details.action }}</span>
          <n-tag size="tiny" :type="entry.info.status === 'running' ? 'warning' : entry.info.action_details.success ? 'success' : 'error'" style="margin-left: 4px">
            {{ entry.info.status === 'running' ? getRuntimeStatusText(entry.info.status) : entry.info.action_details.success ? '成功' : '失败' }}
          </n-tag>
        </div>
        <safe-preview-image
          v-if="nodeImageMap.get(entry.info.node_id)"
          :src="convertFileSrc(nodeImageMap.get(entry.info.node_id)!)"
          class="popover-img"
        />
        <div
          v-if="idx < popoverEntries.length - 1"
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
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.25;
  flex: 1 1 auto;
  min-width: 0;
}

.popover-filter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  margin: 0 8px;
  flex-shrink: 0;
}

.popover-filter-btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.popover-filter-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #8f8f8f;
}

.popover-filter-dot--active {
  background: #d03050;
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

.popover-empty {
  color: var(--flowchart-popover-secondary);
  font-size: 12px;
  text-align: center;
  padding: 10px 0;
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
