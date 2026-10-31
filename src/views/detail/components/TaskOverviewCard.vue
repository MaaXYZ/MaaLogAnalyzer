<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NFlex, NTag, NText, NButton, NDivider } from 'naive-ui'
import type { NodeInfo, TaskInfo } from '../../../types'
import { extractTime, formatDuration } from '../../../utils/formatDuration'

const props = defineProps<{
  task: TaskInfo
  onSelectNode?: (node: NodeInfo) => void
}>()

// 时间戳来源不统一（`2026-02-08 22:59:06.123` / `22:59:06.123` / ISO），
// 先试 Date.parse，失败再退回到「时分秒.毫秒」自行折算；
// 跨天或解析失败一律当作「算不出时长」而不是给出负数。
const parseTimestamp = (ts?: string): number | null => {
  if (!ts) return null
  const direct = Date.parse(ts.includes('T') ? ts : ts.replace(' ', 'T'))
  if (Number.isFinite(direct)) return direct
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/)
  if (!match) return null
  const [, hh, mm, ss, ms] = match
  return (
    (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000 + (ms ? Number(ms.padEnd(3, '0')) : 0)
  )
}

const nodeDuration = (node: NodeInfo): number | null => {
  const start = parseTimestamp(node.ts)
  const end = parseTimestamp(node.end_ts)
  if (start == null || end == null) return null
  const delta = end - start
  if (!Number.isFinite(delta) || delta < 0 || delta > 3_600_000) return null
  return delta
}

const statusMeta = computed(() => {
  if (props.task.status === 'succeeded') return { label: '成功', type: 'success' as const }
  if (props.task.status === 'failed') return { label: '失败', type: 'error' as const }
  return { label: '未完成', type: 'default' as const }
})

const failedNodes = computed(() =>
  props.task.nodes
    .filter((node) => node.status === 'failed')
    .sort((a, b) => (parseTimestamp(a.ts) ?? 0) - (parseTimestamp(b.ts) ?? 0)),
)

const slowestNodes = computed(() =>
  props.task.nodes
    .map((node) => ({ node, duration: nodeDuration(node) }))
    .filter((entry): entry is { node: NodeInfo; duration: number } => entry.duration != null)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3),
)

const durationLabel = computed(() => formatDuration(props.task.duration))
const startTimeLabel = computed(() => extractTime(props.task.start_time) || props.task.start_time)

// 有 onSelectNode 才做成可点：没有回调时不要给出「看起来能点但点了没反应」的 UI
const canSelectNode = computed(() => typeof props.onSelectNode === 'function')

const selectNode = (node: NodeInfo) => {
  props.onSelectNode?.(node)
}
</script>

<template>
  <n-card size="small" class="task-overview" title="任务概要">
    <template #header-extra>
      <n-tag size="small" :type="statusMeta.type">{{ statusMeta.label }}</n-tag>
    </template>

    <n-flex vertical style="gap: 14px">
      <div>
        <div class="task-overview__name" :title="task.entry">{{ task.entry }}</div>
        <n-text depth="3" class="task-overview__meta">
          {{ startTimeLabel }} 开始 · 耗时 {{ durationLabel }} · {{ task.nodes.length }} 个节点
          <template v-if="failedNodes.length"> · {{ failedNodes.length }} 个失败</template>
        </n-text>
      </div>

      <template v-if="failedNodes.length > 0">
        <div>
          <div class="task-overview__section-title">失败节点</div>
          <n-flex vertical style="gap: 2px">
            <n-button
              v-for="node in failedNodes"
              :key="node.node_id"
              text
              size="small"
              class="task-overview__row"
              :disabled="!canSelectNode"
              :title="canSelectNode ? '查看该节点详情' : undefined"
              @click="selectNode(node)"
            >
              <span class="task-overview__row-name">{{ node.name }}</span>
              <span class="task-overview__row-time">{{ extractTime(node.ts) }}</span>
            </n-button>
          </n-flex>
        </div>
        <n-divider style="margin: 0" />
      </template>

      <div>
        <div class="task-overview__section-title">最慢的节点</div>
        <n-flex v-if="slowestNodes.length > 0" vertical style="gap: 2px">
          <n-button
            v-for="entry in slowestNodes"
            :key="entry.node.node_id"
            text
            size="small"
            class="task-overview__row"
            :disabled="!canSelectNode"
            :title="canSelectNode ? '查看该节点详情' : undefined"
            @click="selectNode(entry.node)"
          >
            <span class="task-overview__row-name">{{ entry.node.name }}</span>
            <span class="task-overview__row-time">{{ formatDuration(entry.duration) }}</span>
          </n-button>
        </n-flex>
        <n-text v-else depth="3" style="font-size: 12px">这个任务没有可计算耗时的节点</n-text>
      </div>

      <n-text depth="3" style="font-size: 12px">
        在时间线或节点导航中选择节点可查看识别与动作详情。
      </n-text>
    </n-flex>
  </n-card>
</template>

<style scoped>
.task-overview__name {
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.task-overview__meta {
  font-size: 12px;
}

.task-overview__section-title {
  font-size: 12px;
  opacity: 0.72;
  margin-bottom: 6px;
}

.task-overview__row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
  height: auto;
}

.task-overview__row :deep(.n-button__content) {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 12px;
  overflow: hidden;
}

.task-overview__row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.task-overview__row-time {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  opacity: 0.72;
}
</style>
