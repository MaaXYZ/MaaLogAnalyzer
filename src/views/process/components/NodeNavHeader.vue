<script setup lang="ts">
import { NFlex, NText, NButton, NIcon } from 'naive-ui'
import { VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@vicons/antd'

defineProps<{
  failedOnly: boolean
}>()

const emit = defineEmits<{
  'toggle-failed-only': []
  'scroll-top': []
  'scroll-bottom': []
}>()
</script>

<template>
  <n-flex align="center" justify="space-between" style="padding-right: 16px">
    <n-flex align="center" style="gap: 8px">
      <n-text style="font-size: 14px; font-weight: 500">节点导航</n-text>
      <n-button
        text
        size="tiny"
        @click="emit('toggle-failed-only')"
        :title="failedOnly ? '仅显示失败节点（点击显示全部）' : '显示全部节点（点击仅失败）'"
      >
        <span class="node-nav-filter-dot" :class="{ 'node-nav-filter-dot--active': failedOnly }" />
      </n-button>
    </n-flex>
    <n-flex align="center" style="gap: 2px">
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
</style>
