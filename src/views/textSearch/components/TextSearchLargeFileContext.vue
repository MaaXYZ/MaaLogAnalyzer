<script setup lang="ts">
import { NFlex, NScrollbar, NText } from 'naive-ui'

const props = defineProps<{
  isDark: boolean
  contextLines: string[]
  contextStartLine: number
  selectedLine: number | null
  filterDebugInfo: (line: string) => string
}>()
</script>

<template>
  <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column">
    <div style="padding: 8px 12px; border-bottom: 1px solid var(--n-border-color)">
      <n-flex align="center" justify="space-between">
        <n-text depth="3" style="font-size: 12px">
          显示行 {{ props.contextStartLine }} - {{ props.contextStartLine + props.contextLines.length - 1 }}
          （共 {{ props.contextLines.length }} 行）
        </n-text>
        <n-text v-if="props.selectedLine" type="warning" style="font-size: 12px">
          ▶ 第 {{ props.selectedLine }} 行
        </n-text>
      </n-flex>
    </div>
    <n-scrollbar x-scrollable style="flex: 1" content-style="width: max-content; min-width: 100%;">
      <div
        :class="{ 'dark-theme': props.isDark }"
        style="padding: 12px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 13px; line-height: 1.6; width: max-content; min-width: 100%;"
      >
        <div
          v-for="(line, idx) in props.contextLines"
          :key="idx"
          class="context-line"
          :data-line="props.contextStartLine + idx"
          :style="{
            padding: '2px 8px',
            backgroundColor: (props.contextStartLine + idx) === props.selectedLine ? 'var(--n-color-target)' : 'transparent',
            borderRadius: '2px'
          }"
        >
          <span style="color: var(--n-text-color-disabled); margin-right: 12px; user-select: none">
            {{ String(props.contextStartLine + idx).padStart(6, ' ') }}
          </span>
          <span style="white-space: pre;">{{ props.filterDebugInfo(line) }}</span>
        </div>
      </div>
    </n-scrollbar>
  </div>
</template>

<style scoped>
.dark-theme .context-line span:last-child {
  color: #ffffffa2;
}
</style>
