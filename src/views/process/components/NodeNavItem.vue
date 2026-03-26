<script setup lang="ts">
import { computed } from 'vue'
import { NFlex, NText, NTag } from 'naive-ui'
import type { NodeInfo } from '../../../types'
import type { NodeNavViewItem } from '../composables/useNodeNavSearch'
import { extractTime } from '../../../utils/formatDuration'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'

const props = defineProps<{
  item: NodeNavViewItem
  displayMode: string
  normalizedSearchText: string
}>()

const showMatchDetails = computed(() => {
  return !!props.normalizedSearchText && props.item.matchDetails.length > 0
})

const getNodeNavDotClass = (status: NodeInfo['status']) => {
  if (status === 'success') return 'nav-dot-success'
  if (status === 'running') return 'nav-dot-running'
  return 'nav-dot-failed'
}
</script>

<template>
  <n-flex v-if="displayMode === 'detailed'" vertical style="gap: 4px">
    <n-flex align="center" style="gap: 8px">
      <n-text strong style="font-size: 13px">{{ item.node.name || '未命名节点' }}</n-text>
      <n-text depth="3" style="font-size: 11px">
        {{ extractTime(item.node.ts) }}
      </n-text>
    </n-flex>
    <n-flex align="center" style="gap: 8px">
      <n-tag size="small" :type="getRuntimeStatusTagType(item.node.status)">
        {{ getRuntimeStatusText(item.node.status) }}
      </n-tag>
      <n-tag
        v-if="showMatchDetails"
        size="small"
        type="info"
      >
        {{ item.matchHint }}
      </n-tag>
      <n-text depth="3" style="font-size: 11px">
        #{{ item.originalIndex + 1 }}
      </n-text>
    </n-flex>
    <n-text
      v-if="showMatchDetails"
      depth="3"
      class="node-nav-match-preview"
    >
      {{ item.matchPreview }}
    </n-text>
  </n-flex>

  <n-flex v-else vertical :style="{ gap: displayMode === 'compact' ? '2px' : '2px' }">
    <n-flex align="center" :style="{ gap: displayMode === 'compact' ? '6px' : '4px' }">
      <span class="nav-status-dot" :class="getNodeNavDotClass(item.node.status)" />
      <n-text style="font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
        {{ item.node.name || '未命名节点' }}
      </n-text>
      <n-tag
        v-if="showMatchDetails"
        size="tiny"
        type="info"
      >
        {{ item.matchHint }}
      </n-tag>
      <n-text depth="3" style="font-size: 10px; flex-shrink: 0">{{ extractTime(item.node.ts) }}</n-text>
    </n-flex>
    <n-text
      v-if="showMatchDetails"
      depth="3"
      class="node-nav-match-preview"
    >
      {{ item.matchPreview }}
    </n-text>
  </n-flex>
</template>

<style scoped>
.nav-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.nav-dot-success {
  background: #63e2b7;
}

.nav-dot-running {
  background: #f0a020;
}

.nav-dot-failed {
  background: #d03050;
}

.node-nav-match-preview {
  font-size: 11px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
</style>
