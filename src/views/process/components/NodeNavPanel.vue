<script setup lang="ts">
import { ref } from 'vue'
import {
  NCard, NScrollbar, NList, NListItem, NEmpty,
} from 'naive-ui'
import type { NodeNavViewItem } from '../composables/useNodeNavSearch'
import NodeNavItem from './NodeNavItem.vue'
import NodeNavHeader from './NodeNavHeader.vue'
import NodeNavSearchInput from './NodeNavSearchInput.vue'

const props = defineProps<{
  items: NodeNavViewItem[]
  currentNodesLength: number
  displayMode: string
  searchText: string
  normalizedSearchText: string
  failedOnly: boolean
  emptyDescription: string
}>()

const emit = defineEmits<{
  'update:search-text': [value: string]
  'toggle-failed-only': []
  'select-node': [index: number]
  'manual-scroll-up': []
}>()

const nodeNavScrollbar = ref<InstanceType<typeof NScrollbar> | null>(null)

const scrollToTop = () => {
  nodeNavScrollbar.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

const scrollToBottom = () => {
  nodeNavScrollbar.value?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: 'smooth' })
}

const handleWheel = (event: WheelEvent) => {
  if (event.deltaY < 0) {
    emit('manual-scroll-up')
  }
}

defineExpose({
  scrollToTop,
  scrollToBottom,
})
</script>

<template>
  <n-card
    size="small"
    data-tour="analysis-node-nav"
    style="height: 100%; display: flex; flex-direction: column; position: relative; overflow: visible"
    content-style="padding: 0; flex: 1; min-height: 0; overflow: visible"
  >
    <template #header>
      <node-nav-header
        :failed-only="props.failedOnly"
        @toggle-failed-only="emit('toggle-failed-only')"
        @scroll-top="scrollToTop"
        @scroll-bottom="scrollToBottom"
      />
    </template>
    <div style="display: flex; flex-direction: column; height: 100%; min-height: 0">
      <node-nav-search-input
        :search-text="props.searchText"
        @update:search-text="emit('update:search-text', $event)"
      />
      <n-scrollbar ref="nodeNavScrollbar" style="flex: 1; min-height: 0" @wheel.passive="handleWheel">
        <n-list hoverable clickable v-if="props.items.length > 0">
        <n-list-item
          v-for="item in props.items"
          :key="`nav-${item.node.task_id}-${item.node.node_id}-${item.originalIndex}`"
          @click="emit('select-node', item.originalIndex)"
            :style="{
              cursor: 'pointer',
              padding: props.displayMode === 'detailed' ? '8px 12px' : '4px 8px',
            }"
          >
            <node-nav-item
              :item="item"
              :display-mode="props.displayMode"
              :normalized-search-text="props.normalizedSearchText"
            />
          </n-list-item>
        </n-list>
        <n-empty
          v-else
          :description="props.currentNodesLength > 0 ? props.emptyDescription : '暂无节点数据'"
          style="padding: 24px 0"
        />
      </n-scrollbar>
    </div>
  </n-card>
</template>

<style scoped>
</style>
