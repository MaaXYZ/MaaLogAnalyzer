<script setup lang="ts">
import { ref } from 'vue'
import { NCard, NFlex, NText, NButton, NIcon, NScrollbar, NList, NListItem, NTag } from 'naive-ui'
import { VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@vicons/antd'
import type { TaskInfo } from '../../../types'
import { formatDuration } from '../../../utils/formatDuration'
import { buildTaskIdentity } from '../../../utils/taskIdentity'

const props = defineProps<{
  tasks: TaskInfo[]
  activeTaskIndex: number
}>()

const emit = defineEmits<{
  'select-task': [index: number]
  'manual-scroll-up': []
}>()

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
    style="height: 100%; display: flex; flex-direction: column; position: relative; overflow: visible"
    content-style="padding: 0; flex: 1; min-height: 0; overflow: visible"
  >
    <template #header>
      <n-flex align="center" justify="space-between" style="padding-right: 16px">
        <n-text style="font-size: 14px; font-weight: 500">任务列表</n-text>
        <n-flex align="center" style="gap: 2px">
          <n-button text size="tiny" @click="scrollToTop" title="跳转顶部">
            <n-icon size="16"><vertical-align-top-outlined /></n-icon>
          </n-button>
          <n-button text size="tiny" @click="scrollToBottom" title="跳转底部">
            <n-icon size="16"><vertical-align-bottom-outlined /></n-icon>
          </n-button>
        </n-flex>
      </n-flex>
    </template>
    <n-scrollbar ref="taskListScrollbar" style="height: 100%; max-height: 100%" @wheel.passive="handleWheel">
      <n-list hoverable clickable>
        <n-list-item
          v-for="(task, index) in props.tasks"
          :key="`${buildTaskIdentity(task)}-${index}`"
          @click="emit('select-task', index)"
          :style="{
            backgroundColor: props.activeTaskIndex === index ? 'var(--n-color-target)' : 'transparent',
            cursor: 'pointer',
            padding: '12px 16px'
          }"
        >
          <n-flex vertical style="gap: 8px">
            <n-flex align="center" justify="space-between">
              <n-text strong style="font-size: 15px">{{ task.entry }}</n-text>
              <n-tag size="small" :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                #{{ index + 1 }}
              </n-tag>
            </n-flex>

            <n-flex vertical style="gap: 4px">
              <n-text depth="3" style="font-size: 12px">
                状态:
                <n-text :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                  {{ task.status === 'succeeded' ? '成功' : task.status === 'failed' ? '失败' : '运行中' }}
                </n-text>
              </n-text>
              <n-text depth="3" style="font-size: 12px">
                节点: {{ task.nodes.length }} 个
              </n-text>
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
