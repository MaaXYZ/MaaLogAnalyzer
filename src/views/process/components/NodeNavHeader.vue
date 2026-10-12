<script setup lang="ts">
import { computed } from 'vue'
import { NFlex, NText, NButton, NIcon, NSelect, NBadge } from 'naive-ui'
import { FilterOutlined } from '@vicons/antd'
import type { NodeNavMode } from '../composables/useNodeNavSearch'

const props = defineProps<{
  failedOnly: boolean
  failedCount: number
  mode: NodeNavMode
}>()

const emit = defineEmits<{
  'update:mode': [value: NodeNavMode]
  'toggle-failed-only': []
}>()

const modeOptions: Array<{ label: string; value: NodeNavMode }> = [
  { label: '全部', value: 'pipeline' },
  { label: '识别', value: 'next-list-hit' },
  { label: 'Focus', value: 'focus' },
]

// 未开启时徽标用中性灰，开启后交给 Badge 的主题 error 色
const FILTER_BADGE_IDLE_COLOR = 'rgba(143, 143, 143, 1)'

// 没有失败可筛时（且当前未开启）不显示，免得点出一个空列表
const showFailedFilter = computed(() => props.failedOnly || props.failedCount > 0)

const failedFilterTitle = computed(() => {
  if (props.failedOnly) {
    if (props.mode === 'pipeline') return '仅显示失败节点（点击显示全部）'
    if (props.mode === 'focus') return '仅显示失败 Focus（点击显示全部）'
    return '仅显示异常状态节点（点击显示全部）'
  }
  if (props.mode === 'pipeline') return '显示全部节点（点击仅失败）'
  if (props.mode === 'focus') return '显示全部 Focus（点击仅失败）'
  return '显示全部节点（点击仅异常状态）'
})
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
        v-if="showFailedFilter"
        text
        size="tiny"
        :title="failedFilterTitle"
        :aria-pressed="props.failedOnly ? 'true' : 'false'"
        aria-label="仅看失败"
        @click="emit('toggle-failed-only')"
      >
        <n-flex align="center" style="gap: 2px; flex-wrap: nowrap">
          <n-icon
            :size="16"
            class="node-nav-failed-filter-icon"
            :class="{ 'node-nav-failed-filter-icon--active': props.failedOnly }"
          >
            <filter-outlined />
          </n-icon>
          <n-badge
            v-if="props.failedCount > 0"
            class="node-nav-failed-filter-badge"
            :value="props.failedCount"
            :max="99"
            :type="props.failedOnly ? 'error' : 'default'"
            :color="props.failedOnly ? undefined : FILTER_BADGE_IDLE_COLOR"
          />
        </n-flex>
      </n-button>
    </n-flex>
  </n-flex>
</template>

<style scoped>
/* 「仅失败」筛选：漏斗图标即筛选器，未开启时压暗，开启时用主题色 */
.node-nav-failed-filter-icon {
  opacity: 0.6;
  transition:
    color 0.2s,
    opacity 0.2s;
}

.node-nav-failed-filter-icon--active {
  opacity: 1;
  color: var(--n-color-target);
}

/* 徽标默认 18px/12px 对 tiny 按钮偏大，收一点让它贴着漏斗图标 */
.node-nav-failed-filter-badge :deep(.n-badge-sup) {
  font-size: 10px;
  height: 16px;
  line-height: 16px;
  padding: 0 5px;
  border-radius: 8px;
}

.node-nav-mode-select {
  width: 82px;
}
</style>
