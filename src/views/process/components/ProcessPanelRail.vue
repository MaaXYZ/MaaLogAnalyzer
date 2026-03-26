<script setup lang="ts">
import { NButton } from 'naive-ui'

defineProps<{
  taskListCollapsed: boolean
  nodeNavCollapsed: boolean
  detailViewCollapsed: boolean
  showDetailButton: boolean
}>()

const emit = defineEmits<{
  'toggle-task-list': []
  'toggle-node-nav': []
  'expand-detail': []
}>()
</script>

<template>
  <div class="analysis-layout-rail">
    <n-button
      class="panel-tab-handle panel-tab-handle--left panel-tab-handle--task"
      size="tiny"
      secondary
      strong
      :title="taskListCollapsed ? '展开任务列表' : '收起任务列表'"
      @click="emit('toggle-task-list')"
    >
      <span class="panel-tab-handle__text">任务</span>
    </n-button>

    <n-button
      class="panel-tab-handle panel-tab-handle--left panel-tab-handle--nav"
      size="tiny"
      secondary
      strong
      :title="nodeNavCollapsed ? '展开节点导航' : '收起节点导航'"
      @click="emit('toggle-node-nav')"
    >
      <span class="panel-tab-handle__text">导航</span>
    </n-button>

    <n-button
      v-if="detailViewCollapsed && showDetailButton"
      class="panel-tab-handle panel-tab-handle--left panel-tab-handle--detail"
      size="tiny"
      secondary
      strong
      title="展开节点详情"
      @click="emit('expand-detail')"
    >
      <span class="panel-tab-handle__text">详情</span>
    </n-button>
  </div>
</template>

<style scoped>
.analysis-layout-rail {
  width: 30px;
  flex-shrink: 0;
  position: relative;
  overflow: visible;
}

.panel-tab-handle {
  position: absolute;
  z-index: 1200;
  height: 84px;
  min-width: 28px;
  padding: 6px 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.panel-tab-handle--left {
  left: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.panel-tab-handle--task {
  top: 16px;
  transform: none;
}

.panel-tab-handle--nav {
  top: 112px;
  transform: none;
}

.panel-tab-handle--detail {
  top: 50%;
  transform: translateY(-50%);
}

.panel-tab-handle__text {
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 1px;
  font-size: 12px;
  line-height: 1;
}
</style>
