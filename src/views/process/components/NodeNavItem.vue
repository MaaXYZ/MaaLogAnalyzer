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
  // 未命中复用 timeout 的琥珀色：它是「没识别到」，不是节点失败的红点
  if (status === 'not-hit') return 'nav-dot-timeout'
  if (status === 'timeout') return 'nav-dot-timeout'
  if (status === 'action-failed') return 'nav-dot-action-failed'
  if (status === 'success') return 'nav-dot-success'
  if (status === 'running') return 'nav-dot-running'
  return 'nav-dot-failed'
}

const getNodeNavStatusText = (status: NodeNavStatus): string => {
  if (status === 'not-hit') return '未命中'
  if (status === 'timeout') return '识别超时'
  if (status === 'action-failed') return '动作失败'
  return getRuntimeStatusText(status)
}

const getNodeNavStatusTagType = (status: NodeNavStatus) => {
  if (status === 'not-hit') return 'warning' as const
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
      <n-text class="node-nav-time" depth="3" style="font-size: 11px">
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
      <n-text class="node-nav-index" depth="3" style="font-size: 11px">
        #{{ item.originalIndex + 1 }}
      </n-text>
    </n-flex>
    <n-text v-if="showMatchDetails" depth="3" class="node-nav-match-preview">
      {{ item.matchPreview }}
    </n-text>
  </n-flex>

  <n-flex v-else vertical :style="{ gap: displayMode === 'compact' ? '2px' : '2px' }">
    <n-flex align="center" :style="{ gap: displayMode === 'compact' ? '6px' : '4px' }">
      <span class="nav-status-dot" :class="getNodeNavDotClass(item.navStatus)" aria-hidden="true" />
      <!-- 紧凑模式下状态只剩一个圆点，读屏用户看不到形状，
           用这行隐藏文字把状态补进标题的可访问名（不能用 display:none，那会连读屏一起藏掉） -->
      <span class="node-nav-status-text">{{ getNodeNavStatusText(item.navStatus) }}</span>
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
      <n-text class="node-nav-time" depth="3" style="font-size: 10px; flex-shrink: 0">{{
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

/* 状态不能只靠颜色：红绿色盲、灰度屏或低视力下，这一列会变成一排一模一样的小点。
   因此形状也编码状态 —— 成功=实心圆、运行中=空心环、超时=菱形、
   失败=方块、动作失败=方块+外环。形状只是给视觉用户的冗余信号，
   读屏靠下面的 .node-nav-status-text。 */
.nav-dot-success {
  background: var(--app-status-success);
}

.nav-dot-running {
  border: 2px solid var(--app-status-warning);
  background: transparent;
}

.nav-dot-timeout {
  background: var(--app-status-warning);
  border-radius: 2px;
  transform: rotate(45deg);
}

.nav-dot-failed {
  background: var(--app-status-failed);
  border-radius: 1px;
}

.nav-dot-action-failed {
  background: var(--app-status-failed);
  border-radius: 1px;
  box-shadow: 0 0 0 1.5px var(--app-status-failed);
}

/* 视觉隐藏但留在无障碍树里：用 clip-path 而不是 display:none / visibility:hidden，
   后两者会把文字从可访问名里一起删掉，读屏就听不到状态了。 */
.node-nav-status-text {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* 容器查询：面板被拖窄到 160px 以下时，时间与 #序号 会把节点名挤成一个省略号。
   它们在窄面板里信息量最低，先让位给节点名（容器是 NodeNavPanel 的 .node-nav-body）。 */
@container (max-width: 160px) {
  .node-nav-time,
  .node-nav-index {
    display: none;
  }
}

.node-nav-match-preview {
  font-size: 11px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
</style>
