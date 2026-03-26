<script setup lang="ts">
import type { NodeInfo } from '../../../types'

interface TimelineItem {
  name: string
  status: NodeInfo['status']
}

defineProps<{
  items: TimelineItem[]
  selectedIndex: number | null
  getDotClass: (status: NodeInfo['status']) => string
}>()

const emit = defineEmits<{
  select: [index: number]
}>()
</script>

<template>
  <div style="padding: 4px 0">
    <div
      v-for="(item, idx) in items"
      :key="idx"
      :data-nav-index="idx"
      class="nav-item"
      :class="{ active: selectedIndex === idx }"
      @click="emit('select', idx)"
    >
      <span class="nav-index">#{{ idx + 1 }}</span>
      <span class="nav-name">{{ item.name }}</span>
      <span class="nav-status-dot" :class="getDotClass(item.status)" />
    </div>
  </div>
</template>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.nav-item:hover {
  background: var(--flowchart-nav-hover);
}

.nav-item.active {
  background: var(--flowchart-nav-active);
}

.nav-index {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 6px;
  background: var(--flowchart-badge-bg);
  color: var(--flowchart-badge-text);
  flex-shrink: 0;
  line-height: 16px;
}

.nav-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.nav-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.nav-status-dot.dot-success {
  background: #18a058;
}

.nav-status-dot.dot-running {
  background: #f0a020;
}

.nav-status-dot.dot-failed {
  background: #d03050;
}
</style>
