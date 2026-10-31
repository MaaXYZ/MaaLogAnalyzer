<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { FlowNodeData } from '../utils/flowchartBuilder'

const props = defineProps<{
  data: FlowNodeData
  selected?: boolean
  isStart?: boolean
  dimmed?: boolean
}>()

const nodeStyle = computed(() => {
  const width = props.data.nodeWidth ?? 120
  const height = props.data.nodeHeight ?? 44
  return {
    width: `${width}px`,
    height: `${height}px`,
  }
})
</script>

<template>
  <div
    class="flowchart-node"
    :style="nodeStyle"
    :class="[`status-${data.status}`, { selected, 'is-start': isStart, dimmed }]"
  >
    <Handle type="target" :position="Position.Top" />

    <div class="node-content">
      <span class="node-label">{{ data.label }}</span>
    </div>

    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.flowchart-node {
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: box-shadow 0.2s;
  font-size: 13px;
  box-sizing: border-box;
}

.flowchart-node:hover {
  box-shadow: 0 0 0 2px var(--flowchart-hover-ring);
}

.flowchart-node.dimmed {
  opacity: 0.2;
}

.flowchart-node.selected {
  box-shadow: 0 0 0 3px var(--flowchart-selected-ring);
}

.flowchart-node.is-start {
  border-left-width: 5px;
}

.flowchart-node.status-success {
  background: var(--flowchart-success-bg);
  border: 2px solid var(--flowchart-success-border);
  color: var(--flowchart-success-text);
}

.flowchart-node.status-failed {
  background: var(--flowchart-failed-bg);
  border: 2px solid var(--flowchart-failed-border);
  color: var(--flowchart-failed-text);
}

.flowchart-node.status-running {
  background: var(--flowchart-running-bg);
  border: 2px solid var(--flowchart-running-border);
  color: var(--flowchart-running-text);
}

.flowchart-node.status-not-executed {
  background: var(--flowchart-notexec-bg);
  border: 2px dashed var(--flowchart-notexec-border);
  color: var(--flowchart-notexec-text);
}

.node-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  width: 100%;
  min-width: 0;
}

.node-label {
  display: block;
  max-width: 100%;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
  font-weight: 500;
}

/* 这里的 Handle 只用来给连线定位，用户既不能连也不该看见。
   vue-flow 默认把锚点画成节点上下的小圆点，一张图上看过去全是噪点；
   保留尺寸（只是不可见）以免连线端点位置漂移。 */
.flowchart-node :deep(.vue-flow__handle) {
  opacity: 0;
  pointer-events: none;
}
</style>
