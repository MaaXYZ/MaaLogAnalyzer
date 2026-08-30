<script setup lang="ts">
import { computed } from 'vue'
import { NFlex, NText, NTag } from 'naive-ui'
import type { NodeNavMode, NodeNavStatus, NodeNavViewItem } from '../composables/useNodeNavSearch'
import { extractTime } from '../../../utils/formatDuration'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'

const props = defineProps<{
  item: NodeNavViewItem
  mode: NodeNavMode
  displayMode: string
  normalizedSearchText: string
}>()

const showMatchDetails = computed(() => {
  return !!props.normalizedSearchText && props.item.matchDetails.length > 0
})

const getNodeNavDotClass = (status: NodeNavStatus) => {
  if (status === 'timeout') return 'nav-dot-timeout'
  if (status === 'action-failed') return 'nav-dot-action-failed'
  if (status === 'success') return 'nav-dot-success'
  if (status === 'running') return 'nav-dot-running'
  return 'nav-dot-failed'
}

const getNodeNavStatusText = (status: NodeNavStatus): string => {
  if (status === 'timeout') return '识别超时'
  if (status === 'action-failed') return '动作失败'
  return getRuntimeStatusText(status)
}

const getNodeNavStatusTagType = (status: NodeNavStatus) => {
  if (status === 'timeout') return 'warning' as const
  if (status === 'action-failed') return 'error' as const
  return getRuntimeStatusTagType(status)
}

const focusKindLabelMap = {
  node: '节点',
  recognition: '识别',
  action: '动作',
  flow: '流程',
} as const
</script>

<template>
  <n-flex v-if="displayMode === 'detailed'" vertical style="gap: 4px">
    <n-flex align="center" style="gap: 8px">
      <n-text strong style="font-size: 13px">{{ item.primaryText || '未命名节点' }}</n-text>
      <n-text depth="3" style="font-size: 11px">
        {{ extractTime(item.node.ts) }}
      </n-text>
    </n-flex>
    <n-flex align="center" style="gap: 8px">
      <n-tag size="small" :type="getNodeNavStatusTagType(item.navStatus)">
        {{ getNodeNavStatusText(item.navStatus) }}
      </n-tag>
      <n-tag v-if="mode === 'focus' && item.focusKind" size="small" type="warning">
        {{ focusKindLabelMap[item.focusKind] }}
      </n-tag>
      <n-tag v-if="mode === 'focus' && item.focusDisplay" size="small" type="primary">
        {{ item.focusDisplay }}
      </n-tag>
      <n-tag v-if="showMatchDetails" size="small" type="info">
        {{ item.matchHint }}
      </n-tag>
      <n-text depth="3" style="font-size: 11px"> #{{ item.originalIndex + 1 }} </n-text>
    </n-flex>
    <n-text v-if="showMatchDetails" depth="3" class="node-nav-match-preview">
      {{ item.matchPreview }}
    </n-text>
  </n-flex>

  <n-flex v-else vertical :style="{ gap: displayMode === 'compact' ? '2px' : '2px' }">
    <n-flex align="center" :style="{ gap: displayMode === 'compact' ? '6px' : '4px' }">
      <span class="nav-status-dot" :class="getNodeNavDotClass(item.navStatus)" />
      <n-text
        style="
          font-size: 12px;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        "
      >
        {{ item.primaryText || '未命名节点' }}
      </n-text>
      <n-tag v-if="mode === 'focus' && item.focusKind" size="tiny" type="warning">
        {{ focusKindLabelMap[item.focusKind] }}
      </n-tag>
      <n-tag v-if="showMatchDetails" size="tiny" type="info">
        {{ item.matchHint }}
      </n-tag>
      <n-text depth="3" style="font-size: 10px; flex-shrink: 0">{{
        extractTime(item.node.ts)
      }}</n-text>
    </n-flex>
    <n-text v-if="showMatchDetails" depth="3" class="node-nav-match-preview">
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

.nav-dot-timeout {
  background: #f0a020;
}

.nav-dot-action-failed {
  background: #d03050;
  box-shadow: 0 0 0 1px rgba(208, 48, 80, 0.25);
}

.node-nav-match-preview {
  font-size: 11px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
</style>
