<script setup lang="ts">
import { NFlex, NText, NButton, NIcon, NSelect } from 'naive-ui'
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

const modeOptions: Array<{ label: string; value: NodeNavMode }> = [
  { label: '全部', value: 'pipeline' },
  { label: '识别', value: 'next-list-hit' },
  { label: 'Focus', value: 'focus' },
]
</script>

<template>
  <n-flex
    align="center"
    style="padding-right: 6px; flex-wrap: wrap; overflow: hidden; row-gap: 4px"
  >
    <n-flex align="center" style="gap: 4px; flex-wrap: nowrap; flex-shrink: 0">
      <n-text style="font-size: 14px; font-weight: 500; white-space: nowrap">节点导航</n-text>
      <n-select
        class="node-nav-mode-select"
        :value="mode"
        :options="modeOptions"
        size="small"
        :consistent-menu-width="false"
        @update:value="(value) => emit('update:mode', value as NodeNavMode)"
      />
      <n-button
        text
        size="tiny"
        @click="emit('toggle-failed-only')"
        :title="
          failedOnly
            ? mode === 'pipeline'
              ? '仅显示失败节点（点击显示全部）'
              : mode === 'focus'
                ? '仅显示失败 Focus（点击显示全部）'
                : '仅显示异常状态节点（点击显示全部）'
            : mode === 'pipeline'
              ? '显示全部节点（点击仅失败）'
              : mode === 'focus'
                ? '显示全部 Focus（点击仅失败）'
                : '显示全部节点（点击仅异常状态）'
        "
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

.node-nav-mode-select {
  width: 82px;
}
</style>
