<script setup lang="ts">
import {
  NFlex,
  NText,
  NButton,
  NIcon,
  NRadioGroup,
  NRadioButton,
} from 'naive-ui'
import { VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@vicons/antd'
import type { NodeNavMode } from '../composables/useNodeNavSearch'

defineProps<{
  failedOnly: boolean
  mode: NodeNavMode
}>()

const emit = defineEmits<{
  'update:mode': [value: NodeNavMode]
  'toggle-failed-only': []
  'scroll-top': []
  'scroll-bottom': []
}>()
</script>

<template>
  <n-flex align="center" style="padding-right: 6px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden">
    <n-flex align="center" style="gap: 4px; flex-wrap: nowrap; flex-shrink: 0">
      <n-text style="font-size: 14px; font-weight: 500; white-space: nowrap">节点导航</n-text>
      <n-radio-group
        class="node-nav-mode-group"
        :value="mode"
        size="small"
        @update:value="(value) => emit('update:mode', value as NodeNavMode)"
      >
        <n-radio-button value="pipeline" title="按 Pipeline 节点列表显示">全部</n-radio-button>
        <n-radio-button value="next-list-hit" title="按根层 NextList 命中节点显示">命中</n-radio-button>
      </n-radio-group>
      <n-button
        v-if="mode === 'pipeline'"
        text
        size="tiny"
        @click="emit('toggle-failed-only')"
        :title="failedOnly ? '仅显示失败节点（点击显示全部）' : '显示全部节点（点击仅失败）'"
      >
        <span class="node-nav-filter-dot" :class="{ 'node-nav-filter-dot--active': failedOnly }" />
      </n-button>
    </n-flex>
    <div style="flex: 1 1 auto; min-width: 2px" />
    <n-flex align="center" style="gap: 1px; flex-wrap: nowrap; flex-shrink: 0; margin-left: 0">
      <n-button text size="tiny" @click="emit('scroll-top')" title="跳转顶部">
        <n-icon size="16"><vertical-align-top-outlined /></n-icon>
      </n-button>
      <n-button text size="tiny" @click="emit('scroll-bottom')" title="跳转底部">
        <n-icon size="16"><vertical-align-bottom-outlined /></n-icon>
      </n-button>
    </n-flex>
  </n-flex>
</template>

<style scoped>
.node-nav-filter-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #8f8f8f;
}

.node-nav-filter-dot--active {
  background: #d03050;
}

.node-nav-mode-group {
  --n-button-padding: 0 3px;
  --n-button-font-size: 12px;
  --n-button-height: 18px;
  --n-button-border-radius: 4px;
}

.node-nav-mode-group :deep(.n-radio-button) {
  min-width: 0;
}
</style>
