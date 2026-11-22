<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NFlex, NText, NProgress } from 'naive-ui'
import type { TaskSummary } from '../../../types'

interface Props {
  show: boolean
  width: string
  progress: number
  /** 解析进行中的任务瘦摘要：解析完一个分卷就会增补一批。 */
  taskSummaries?: TaskSummary[]
  inputsProgress?: { parsedInputs: number; totalInputs: number }
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const showModel = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
})

// 播报粒度按 10% 一档：进度条每 1% 更新一次，如果 1% 播报一条，
// 解析一个大日志会往读屏塞上百条消息，反而把真正要听的内容淹没。
const announcedPercent = computed(() => Math.min(100, Math.floor(props.progress / 10) * 10))

const summaries = computed(() => props.taskSummaries ?? [])

const statusLabel = (status: TaskSummary['status']) => {
  if (status === 'failed') return '失败'
  if (status === 'running') return '进行中'
  return '成功'
}

const formatDuration = (duration?: number) => {
  if (duration == null || !Number.isFinite(duration)) return ''
  const seconds = duration / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m${String(rest).padStart(2, '0')}s`
}
</script>

<template>
  <n-modal
    v-model:show="showModel"
    preset="card"
    title="正在解析日志文件"
    :style="{ width: props.width }"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
  >
    <n-flex vertical style="gap: 16px; padding: 12px 0">
      <n-text style="text-align: center; font-size: 16px">
        {{ props.progress >= 100 ? '正在整理任务数据…' : `解析进度：${props.progress}%` }}
      </n-text>
      <!-- 视觉隐藏的播报区：可见的那行百分比对读屏不是 live 内容，
           不加这个的话「0→100%」全程静音，用户不知道还要等多久、也不知道已经完成 -->
      <div
        v-if="props.show"
        class="app-visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ announcedPercent >= 100 ? '日志解析完成，正在整理任务数据' : `日志解析进度 ${announcedPercent}%` }}
      </div>
      <n-progress
        type="line"
        :percentage="props.progress"
        :show-indicator="false"
        :height="24"
        status="success"
      />

      <!-- 边解析边上屏：整树投影比解析还慢，先让用户看到已经解析出哪些任务，
           避免长时间停在「解析进度 N%」上不知道进展。明细等解析完成后再加载。 -->
      <template v-if="summaries.length > 0">
        <n-text depth="2" style="text-align: center; font-size: 13px">
          已解析
          {{ props.inputsProgress?.parsedInputs ?? 0 }}/{{ props.inputsProgress?.totalInputs ?? 0 }}
          个日志分卷 · 已发现 {{ summaries.length }} 个任务
        </n-text>
        <div class="parsing-task-list" role="list" aria-label="已发现的任务">
          <div
            v-for="(summary, index) in summaries"
            :key="`${summary.process_id ?? ''}:${summary.task_id}:${summary.start_time}:${index}`"
            class="parsing-task-row"
            role="listitem"
          >
            <span class="parsing-task-status" :data-status="summary.status">
              {{ statusLabel(summary.status) }}
            </span>
            <span class="parsing-task-name" :title="summary.entry">{{ summary.entry }}</span>
            <span class="parsing-task-meta">{{ formatDuration(summary.duration) }}</span>
            <span class="parsing-task-meta">{{ summary.node_count }} 节点</span>
          </div>
        </div>
        <n-text depth="3" style="text-align: center; font-size: 12px">
          任务明细（节点、识别、动作）会在解析完成后自动加载
        </n-text>
      </template>

      <n-text depth="3" style="text-align: center; font-size: 13px">
        {{ props.progress >= 100
          ? '解析完成，正在生成任务视图，请稍候…'
          : '正在分块处理日志，请稍候...' }}
      </n-text>
    </n-flex>
  </n-modal>
</template>

<style scoped>
.parsing-task-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.04);
}

.parsing-task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
  line-height: 1.5;
}

.parsing-task-status {
  flex: none;
  min-width: 44px;
  text-align: center;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 12px;
  color: #fff;
  background: #18a058;
}

.parsing-task-status[data-status='failed'] {
  background: #d03050;
}

.parsing-task-status[data-status='running'] {
  background: #2080f0;
}

.parsing-task-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parsing-task-meta {
  flex: none;
  color: rgba(15, 23, 42, 0.55);
  font-variant-numeric: tabular-nums;
}
</style>
