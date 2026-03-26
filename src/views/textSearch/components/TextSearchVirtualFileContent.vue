<script setup lang="ts">
import { ref } from 'vue'
import { NVirtualList } from 'naive-ui'
import { parseLogLine } from '../../../utils/logHighlighter'

interface FileLineItem {
  key: number
  content: string
}

const props = defineProps<{
  isDark: boolean
  fileLines: FileLineItem[]
  selectedLine: number | null
}>()

const emit = defineEmits<{
  'update:selectedLine': [value: number | null]
}>()

const virtualListRef = ref<any>(null)

const scrollToLine = (lineNumber: number) => {
  if (!virtualListRef.value) return
  const itemSize = 22
  const topOffset = 3
  const targetIndex = Math.max(0, lineNumber - 1 - topOffset)
  const scrollTop = targetIndex * itemSize

  const scrollContainer = virtualListRef.value.$el?.querySelector('.v-vl') as HTMLElement | null
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollTop
    return
  }

  try {
    virtualListRef.value.scrollTo({ index: targetIndex, behavior: 'auto' })
  } catch {
    // ignore scroll failure
  }
}

defineExpose({
  scrollToLine,
})
</script>

<template>
  <div style="flex: 1; height: 100%; overflow: hidden;">
    <n-virtual-list
      ref="virtualListRef"
      :items="props.fileLines"
      :item-size="22"
      style="height: 100%; max-height: 100%; overflow: auto;"
      :class="['log-virtual-list', { 'dark-theme': props.isDark }]"
    >
      <template #default="{ item, index }">
        <div
          class="log-line"
          :class="{ 'selected-line': (index + 1) === props.selectedLine }"
          :data-line="index + 1"
          @click="emit('update:selectedLine', index + 1)"
        >
          <span class="line-number">{{ index + 1 }}</span>
          <span class="line-content">
            <span
              v-for="(token, tIdx) in parseLogLine(item.content)"
              :key="tIdx"
              :class="'token-' + token.type"
            >{{ token.content }}</span>
          </span>
        </div>
      </template>
    </n-virtual-list>
  </div>
</template>

<style scoped>
.log-virtual-list {
  background-color: var(--n-color);
}

.log-line {
  display: flex;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 22px;
  white-space: pre;
  cursor: text;
  padding-right: 12px;
  width: max-content;
  min-width: 100%;
}

.log-line:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.selected-line {
  background-color: rgba(242, 201, 125, 0.2);
}

.line-number {
  display: inline-block;
  width: 50px;
  text-align: right;
  padding-right: 12px;
  color: var(--n-text-color-disabled);
  user-select: none;
  border-right: 1px solid var(--n-border-color);
  margin-right: 8px;
  background-color: #f5f5f5;
  flex-shrink: 0;
}

.line-content {
  flex: 1;
  white-space: nowrap;
}

.token-timestamp { color: #098658; }
.token-level-info { color: #0000ff; font-weight: bold; }
.token-level-warn { color: #795e26; font-weight: bold; }
.token-level-error { color: #cd3131; font-weight: bold; }
.token-level-debug { color: #800080; }
.token-string { color: #a31515; }
.token-number { color: #098658; }
.token-key { color: #0451a5; }
.token-text { color: #333; }

.dark-theme .log-line:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.dark-theme .line-number {
  color: #666;
  border-right-color: #333;
  background-color: #1e1e1e;
}

.dark-theme .token-timestamp { color: #b5cea8; }
.dark-theme .token-level-info { color: #569cd6; }
.dark-theme .token-level-warn { color: #dcdcaa; }
.dark-theme .token-level-error { color: #f44747; }
.dark-theme .token-level-debug { color: #d16969; }
.dark-theme .token-string { color: #ce9178; }
.dark-theme .token-number { color: #b5cea8; }
.dark-theme .token-key { color: #9cdcfe; }
.dark-theme .token-text { color: #ffffffa2; }

.log-virtual-list :deep(.v-vl) {
  overflow: auto !important;
  scrollbar-width: auto !important;
}

.log-virtual-list :deep(.v-vl-items) {
  min-width: 100%;
  width: max-content !important;
}

.log-virtual-list :deep(.v-vl-item) {
  width: max-content !important;
  min-width: 100%;
}

.log-virtual-list :deep(.v-vl)::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.log-virtual-list :deep(.v-vl)::-webkit-scrollbar-track {
  background: transparent;
}

.log-virtual-list :deep(.v-vl)::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
}

.log-virtual-list :deep(.v-vl)::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.4);
}

.dark-theme :deep(.v-vl)::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.25);
}

.dark-theme :deep(.v-vl)::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.4);
}

.log-virtual-list :deep(.v-vl)::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
