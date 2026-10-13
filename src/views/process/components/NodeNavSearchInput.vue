<script setup lang="ts">
import { computed } from 'vue'
import { NInput, NButton, NIcon } from 'naive-ui'
import { VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@vicons/antd'

const props = defineProps<{
  searchText: string
}>()

const emit = defineEmits<{
  'update:search-text': [value: string]
  'next-match': [delta: number]
  'scroll-top': []
  'scroll-bottom': []
}>()

const searchTextModel = computed({
  get: () => props.searchText,
  set: (value: string) => emit('update:search-text', value),
})
</script>

<template>
  <div class="node-nav-search-wrap">
    <div class="node-nav-search-shell">
      <n-input
        v-model:value="searchTextModel"
        class="node-nav-search-input"
        :bordered="false"
        clearable
        size="small"
        placeholder="搜索节点 / 识别"
        title="支持节点名与识别项搜索，Enter 跳转下一处（Next），Shift+Enter 跳上一处"
        @keydown.enter="emit('next-match', $event.shiftKey ? -1 : 1)"
      />
    </div>
    <n-button text size="tiny" title="跳转顶部" @click="emit('scroll-top')">
      <n-icon size="16"><vertical-align-top-outlined /></n-icon>
    </n-button>
    <n-button text size="tiny" title="跳转底部" @click="emit('scroll-bottom')">
      <n-icon size="16"><vertical-align-bottom-outlined /></n-icon>
    </n-button>
  </div>
</template>

<style scoped>
/* 搜索框吃掉剩余宽度，跳转按钮固定在右侧，所以这一行永远不会换行 */
.node-nav-search-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px 8px 12px;
}

.node-nav-search-shell {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(127, 127, 127, 0.65);
  border-radius: 6px;
  background: var(--n-color, transparent);
}

.node-nav-search-input :deep(.n-input-wrapper) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}

body.force-dark .node-nav-search-shell {
  border-color: rgba(255, 255, 255, 0.28);
}

body.force-light .node-nav-search-shell {
  border-color: rgba(0, 0, 0, 0.24);
}
</style>
