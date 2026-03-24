<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { FlowNodeData } from '../utils/flowchartBuilder'

defineProps<{
  data: FlowNodeData
  selected?: boolean
  isStart?: boolean
  dimmed?: boolean
}>()
</script>

<template>
  <div
    class="flowchart-node"
    :class="[`status-${data.status}`, { selected, 'is-start': isStart, dimmed }]"
  >
    <Handle type="target" :position="Position.Top" />

    <div class="node-content">
      <span class="node-label">{{ data.label }}</span>
      <span
        v-if="data.executionOrder.length > 0"
        class="node-badge"
      >
        #{{ data.executionOrder.join(',#') }}
      </span>
    </div>

    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.flowchart-node {
  width: 180px;
  height: 60px;
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
  gap: 2px;
  padding: 0 8px;
  overflow: hidden;
}

.node-label {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.node-badge {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--flowchart-badge-bg);
  color: var(--flowchart-badge-text);
  line-height: 16px;
}
</style>
