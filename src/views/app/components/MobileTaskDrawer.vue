<script setup lang="ts">
import { NDrawer, NDrawerContent, NScrollbar, NList, NListItem, NFlex, NText, NTag } from 'naive-ui'
import type { TaskInfo } from '../../../types'
import { formatDuration } from '../../../utils/formatDuration'

defineProps<{
  show: boolean
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'select-task': [task: TaskInfo]
}>()

const handleUpdateShow = (value: boolean) => {
  emit('update:show', value)
}

const handleSelectTask = (task: TaskInfo) => {
  emit('select-task', task)
}
</script>

<template>
  <n-drawer
    :show="show"
    placement="left"
    :width="280"
    @update:show="handleUpdateShow"
  >
    <n-drawer-content title="任务列表">
      <n-scrollbar style="height: 100%">
        <n-list hoverable clickable>
          <n-list-item
            v-for="(task, index) in tasks"
            :key="task.task_id"
            @click="handleSelectTask(task)"
            :style="{
              backgroundColor: selectedTask?.task_id === task.task_id ? 'var(--n-color-target)' : 'transparent',
              cursor: 'pointer',
              padding: '12px 16px',
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
              </n-flex>
            </n-flex>
          </n-list-item>
        </n-list>
      </n-scrollbar>
    </n-drawer-content>
  </n-drawer>
</template>
