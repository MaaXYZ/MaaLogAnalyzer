<script setup lang="ts">
const props = defineProps<{
  label: string
  count: number
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    type="button"
    class="task-date-divider"
    :aria-expanded="!props.collapsed"
    :title="props.collapsed ? '展开该日期的任务' : '收起该日期的任务'"
    @click="emit('toggle')"
  >
    <span class="task-date-divider__date">{{ props.label }}</span>
    <span class="task-date-divider__count">
      {{ props.count }} 个任务{{ props.collapsed ? ' · 已收起' : '' }}
    </span>
  </button>
</template>

<style scoped>
/* 两条横线把日期分组与上下文隔开：不用三角、不用胶囊、不用长横线 */
.task-date-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 16px;
  border: none;
  border-top: 1px solid rgba(128, 128, 128, 0.28);
  border-bottom: 1px solid rgba(128, 128, 128, 0.28);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s;
}

.task-date-divider:hover {
  background-color: rgba(128, 128, 128, 0.1);
}

.task-date-divider:focus-visible {
  outline: 2px solid var(--n-color-target, currentColor);
  outline-offset: -2px;
}

.task-date-divider__date {
  font-size: 12px;
  font-weight: 600;
}

.task-date-divider__count {
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.6;
}
</style>
