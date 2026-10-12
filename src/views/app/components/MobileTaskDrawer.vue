<script setup lang="ts">
import { computed } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NScrollbar,
  NList,
  NListItem,
  NFlex,
  NText,
  NTag,
  useThemeVars,
} from 'naive-ui'
import type { TaskInfo } from '../../../types'
import { formatDuration } from '../../../utils/formatDuration'
import { buildTaskIdentity, isSameTask } from '@windsland52/maa-log-tools/task-identity'

const props = defineProps<{
  show: boolean
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'select-task': [task: TaskInfo]
}>()

// 抽屉不在 n-card 内，取不到卡片提供的 --n-color-target，这里用当前主题主色补上，
// 使选中态样式与桌面任务列表保持一致（同一个变量名，同一套 CSS）。
const themeVars = useThemeVars()
const accentStyle = computed(() => ({ '--n-color-target': themeVars.value.primaryColor }))

const handleUpdateShow = (value: boolean) => {
  emit('update:show', value)
}

const handleSelectTask = (task: TaskInfo) => {
  emit('select-task', task)
}

const isSelectedTask = (task: TaskInfo) => {
  return props.selectedTask != null && isSameTask(props.selectedTask, task)
}
</script>

<template>
  <n-drawer :show="show" placement="left" :width="280" @update:show="handleUpdateShow">
    <n-drawer-content title="任务列表">
      <n-scrollbar style="height: 100%">
        <n-list hoverable clickable :style="accentStyle">
          <n-list-item
            v-for="(task, index) in tasks"
            :key="buildTaskIdentity(task)"
            @click="handleSelectTask(task)"
            :class="{ 'task-list-item-selected': isSelectedTask(task) }"
            :style="{
              cursor: 'pointer',
              padding: '12px 16px',
            }"
          >
            <n-flex vertical style="gap: 8px">
              <n-flex align="center" justify="space-between">
                <n-text strong style="font-size: 15px">{{ task.entry }}</n-text>
                <n-tag
                  size="small"
                  :type="
                    task.status === 'succeeded'
                      ? 'success'
                      : task.status === 'failed'
                        ? 'error'
                        : 'warning'
                  "
                >
                  #{{ index + 1 }}
                </n-tag>
              </n-flex>
              <n-flex vertical style="gap: 4px">
                <n-text depth="3" style="font-size: 12px">
                  状态:
                  <n-text
                    :type="
                      task.status === 'succeeded'
                        ? 'success'
                        : task.status === 'failed'
                          ? 'error'
                          : 'warning'
                    "
                  >
                    {{
                      task.status === 'succeeded'
                        ? '成功'
                        : task.status === 'failed'
                          ? '失败'
                          : '运行中'
                    }}
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

<style scoped>
/* 与桌面任务列表同一套选中态样式：主色浅底 + 左侧色条 */
.n-list .task-list-item-selected,
.n-list .task-list-item-selected:hover {
  background-color: rgba(128, 128, 128, 0.16);
  background-color: color-mix(in srgb, var(--n-color-target) 14%, transparent);
  box-shadow: inset 3px 0 0 0 var(--n-color-target);
}
</style>
