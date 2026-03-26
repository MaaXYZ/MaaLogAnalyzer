<script setup lang="ts">
import { computed } from 'vue'
import { NInput } from 'naive-ui'

const props = defineProps<{
  searchText: string
}>()

const emit = defineEmits<{
  'update:search-text': [value: string]
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
        placeholder="搜索节点 / 识别 / Next"
      />
    </div>
  </div>
</template>

<style scoped>
.node-nav-search-wrap {
  padding: 0 12px 8px 12px;
}

.node-nav-search-shell {
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
