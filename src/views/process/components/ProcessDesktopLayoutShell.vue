<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NFlex, NText, NSplit } from 'naive-ui'
import ProcessPanelRail from './ProcessPanelRail.vue'

const props = defineProps<{
  taskListCollapsed: boolean
  nodeNavCollapsed: boolean
  detailViewCollapsed: boolean
  showDetailButton: boolean
  taskListSize: number
  nodeNavSize: number
}>()

const emit = defineEmits<{
  'update:task-list-size': [value: number]
  'update:node-nav-size': [value: number]
  'toggle-task-list': []
  'toggle-node-nav': []
  'expand-detail': []
}>()

const taskListSizeModel = computed({
  get: () => props.taskListSize,
  set: (value: number) => emit('update:task-list-size', value),
})

const nodeNavSizeModel = computed({
  get: () => props.nodeNavSize,
  set: (value: number) => emit('update:node-nav-size', value),
})
</script>

<template>
  <div class="analysis-layout-shell">
    <process-panel-rail
      :task-list-collapsed="taskListCollapsed"
      :node-nav-collapsed="nodeNavCollapsed"
      :detail-view-collapsed="detailViewCollapsed"
      :show-detail-button="showDetailButton"
      @toggle-task-list="emit('toggle-task-list')"
      @toggle-node-nav="emit('toggle-node-nav')"
      @expand-detail="emit('expand-detail')"
    />

    <n-split
      class="analysis-main-split"
      direction="horizontal"
      v-model:size="taskListSizeModel"
      :min="0"
      :max="0.4"
      style="flex: 1; min-height: 0; overflow: visible"
    >
      <template #1>
        <slot name="task-list" />
      </template>

      <template #2>
        <n-card
          size="small"
          data-tour="analysis-node-timeline"
          style="height: 100%; display: flex; flex-direction: column; position: relative; overflow: visible"
          content-style="padding: 0; flex: 1; min-height: 0; overflow: visible"
        >
          <template #header>
            <n-flex align="center" justify="space-between" style="padding-right: 16px">
              <n-text style="font-size: 14px; font-weight: 500">节点时间线</n-text>
              <slot name="timeline-toolbar" />
            </n-flex>
          </template>

          <n-split
            class="analysis-node-split"
            direction="horizontal"
            v-model:size="nodeNavSizeModel"
            :min="0"
            :max="0.4"
            style="height: 100%; overflow: visible"
          >
            <template #1>
              <slot name="node-nav" />
            </template>

            <template #2>
              <slot name="timeline-list" />
            </template>
          </n-split>
        </n-card>
      </template>
    </n-split>
  </div>
</template>

<style scoped>
.analysis-layout-shell {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: visible;
}

:deep(.analysis-main-split .n-split-pane),
:deep(.analysis-node-split .n-split-pane) {
  overflow: visible;
}
</style>
