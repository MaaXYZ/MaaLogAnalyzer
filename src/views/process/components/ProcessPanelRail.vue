<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'

const props = defineProps<{
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

// 这些竖排把手只在面板「收起后」出现，充当展开入口。
// 面板展开时把它们留在原地会跟面板本身错位（导航把手贴在屏幕最左边、面板却在 200px 之外），
// 所以展开态的折叠动作交给各自面板标题栏里的按钮。
const visible = computed(
  () =>
    props.taskListCollapsed ||
    props.nodeNavCollapsed ||
    (props.detailViewCollapsed && props.showDetailButton),
)
</script>

<template>
  <div v-if="visible" class="analysis-layout-rail">
    <n-button
      v-if="props.taskListCollapsed"
      class="panel-tab-handle panel-tab-handle--left panel-tab-handle--task"
      size="tiny"
      secondary
      strong
      title="展开任务列表"
      @click="emit('toggle-task-list')"
    >
      <span class="panel-tab-handle__text">任务</span>
    </n-button>

    <n-button
      v-if="props.nodeNavCollapsed"
      class="panel-tab-handle panel-tab-handle--left panel-tab-handle--nav"
      size="tiny"
      secondary
      strong
      title="展开节点导航"
      @click="emit('toggle-node-nav')"
    >
      <span class="panel-tab-handle__text">导航</span>
    </n-button>

    <n-button
      v-if="props.detailViewCollapsed && props.showDetailButton"
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
