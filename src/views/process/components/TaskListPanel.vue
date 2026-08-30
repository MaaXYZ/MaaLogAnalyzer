<script setup lang="ts">
import { computed, ref } from 'vue'
import { NCard, NFlex, NText, NButton, NIcon, NScrollbar, NList, NListItem, NTag } from 'naive-ui'
import { VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@vicons/antd'
import type { TaskInfo } from '../../../types'
import { formatDuration } from '../../../utils/formatDuration'
import { buildTaskIdentity } from '@windsland52/maa-log-tools/task-identity'

const props = withDefaults(
  defineProps<{
    tasks: TaskInfo[]
    activeTaskIndex: number
    // 实时跟随时未结束任务是真正的“运行中”；静态文件里则应表述为“未完成”
    isRealtimeStreaming?: boolean
  }>(),
  {
    isRealtimeStreaming: false,
  },
)

const emit = defineEmits<{
  'select-task': [index: number]
  'manual-scroll-up': []
  'locate-failure': [index: number, nodeId: number]
}>()

interface FailureJump {
  nodeId: number
  label: string
}

// 失败任务的跳转目标：任务内最后一个失败节点；无失败节点时回退最后一个节点
const buildFailureJump = (task: TaskInfo): FailureJump | null => {
  if (task.status !== 'failed') return null
  const failedNodes = (task.nodes || []).filter((node) => node.status === 'failed')
  const target = failedNodes[failedNodes.length - 1] ?? task.nodes[task.nodes.length - 1]
  if (!target) return null
  return {
    nodeId: target.node_id,
    label: failedNodes.length > 1 ? `${target.name} 等 ${failedNodes.length} 处` : target.name,
  }
}

const failureJumpByIndex = computed(() => {
  const map = new Map<number, FailureJump>()
  props.tasks.forEach((task, index) => {
    const jump = buildFailureJump(task)
    if (jump) map.set(index, jump)
  })
  return map
})

const getFailureJump = (index: number): FailureJump | undefined =>
  failureJumpByIndex.value.get(index)

const statusMeta = (
  task: TaskInfo,
): { label: string; type: 'success' | 'error' | 'warning' | 'default' } => {
  if (task.status === 'succeeded') return { label: '成功', type: 'success' }
  if (task.status === 'failed') return { label: '失败', type: 'error' }
  return props.isRealtimeStreaming
    ? { label: '运行中', type: 'warning' }
    : { label: '未完成', type: 'default' }
}

const taskListScrollbar = ref<InstanceType<typeof NScrollbar> | null>(null)

const scrollToTop = () => {
  taskListScrollbar.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

const scrollToBottom = () => {
  taskListScrollbar.value?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: 'smooth' })
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
    data-tour="analysis-task-list"
    style="
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: visible;
    "
    content-style="padding: 0; flex: 1; min-height: 0; overflow: visible"
  >
    <template #header>
      <n-flex
        align="center"
        justify="space-between"
        style="padding-right: 10px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden"
      >
        <n-text style="font-size: 14px; font-weight: 500; white-space: nowrap; flex-shrink: 0"
          >任务列表</n-text
        >
        <n-flex align="center" style="gap: 2px; flex-wrap: nowrap; flex-shrink: 0; margin-left: 0">
          <n-button text size="tiny" @click="scrollToTop" title="跳转顶部">
            <n-icon size="16"><vertical-align-top-outlined /></n-icon>
          </n-button>
          <n-button text size="tiny" @click="scrollToBottom" title="跳转底部">
            <n-icon size="16"><vertical-align-bottom-outlined /></n-icon>
          </n-button>
        </n-flex>
      </n-flex>
    </template>
    <n-scrollbar
      ref="taskListScrollbar"
      style="height: 100%; max-height: 100%"
      @wheel.passive="handleWheel"
    >
      <n-list hoverable clickable>
        <n-list-item
          v-for="(task, index) in props.tasks"
          :key="`${buildTaskIdentity(task)}-${index}`"
          @click="emit('select-task', index)"
          :style="{
            backgroundColor:
              props.activeTaskIndex === index ? 'var(--n-color-target)' : 'transparent',
            cursor: 'pointer',
            padding: '12px 16px',
          }"
        >
          <n-flex vertical style="gap: 8px">
            <n-flex align="center" justify="space-between">
              <n-text strong style="font-size: 15px">{{ task.entry }}</n-text>
              <n-tag size="small" :type="statusMeta(task).type"> #{{ index + 1 }} </n-tag>
            </n-flex>

            <n-flex vertical style="gap: 4px">
              <n-text depth="3" style="font-size: 12px">
                状态:
                <n-text :type="statusMeta(task).type">
                  {{ statusMeta(task).label }}
                </n-text>
                <template v-if="getFailureJump(index)">
                  <n-text depth="3"> · 失败于 </n-text>
                  <n-tag
                    size="small"
                    type="error"
                    :bordered="false"
                    style="cursor: pointer"
                    title="点击定位到失败节点"
                    @click.stop="emit('locate-failure', index, getFailureJump(index)?.nodeId ?? -1)"
                  >
                    {{ getFailureJump(index)?.label }}
                  </n-tag>
                </template>
              </n-text>
              <n-text depth="3" style="font-size: 12px"> 节点: {{ task.nodes.length }} 个 </n-text>
              <n-text depth="3" style="font-size: 12px" v-if="task.duration">
                耗时: {{ formatDuration(task.duration) }}
              </n-text>
              <n-text depth="3" style="font-size: 12px" v-if="task.start_time">
                时间: {{ task.start_time }}
              </n-text>
            </n-flex>
          </n-flex>
        </n-list-item>
      </n-list>
    </n-scrollbar>
  </n-card>
</template>
