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
import TaskDateDivider from '../../../components/TaskDateDivider.vue'
import { buildTaskDateGroups, buildTaskMetaLine } from '../../../utils/taskListFormat'
import { useTaskGroupCollapse } from '../../../composables/useTaskGroupCollapse'
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

// 与桌面任务列表一致：按开始日期分组，日期只在组开头用 badge 显示一次
const taskGroups = computed(() => buildTaskDateGroups(props.tasks))

// 分组可以点击折叠/展开；选中项落在折叠分组里时会自动展开
const activeTaskIndex = computed(() => {
  const selected = props.selectedTask
  if (!selected) return -1
  return props.tasks.findIndex((task) => isSameTask(selected, task))
})
const { isCollapsed, toggleGroup } = useTaskGroupCollapse({
  groups: taskGroups,
  activeIndex: activeTaskIndex,
})

// 与桌面任务列表同一行式元信息：节点数 · 耗时 · 时间
const taskMetaLine = (task: TaskInfo): string =>
  buildTaskMetaLine({
    nodeCount: task.nodes.length,
    duration: task.duration,
    startTime: task.start_time,
  })
</script>

<template>
  <n-drawer :show="show" placement="left" :width="280" @update:show="handleUpdateShow">
    <n-drawer-content title="任务列表">
      <n-scrollbar style="height: 100%">
        <n-list hoverable clickable :style="accentStyle">
          <template v-for="group in taskGroups" :key="group.id">
            <n-list-item class="task-date-divider-item">
              <task-date-divider
                :label="group.label"
                :count="group.items.length"
                :collapsed="isCollapsed(group)"
                @toggle="toggleGroup(group)"
              />
            </n-list-item>

            <template v-if="!isCollapsed(group)">
              <n-list-item
                v-for="entry in group.items"
                :key="buildTaskIdentity(entry.task)"
                @click="handleSelectTask(entry.task)"
                :class="{ 'task-list-item-selected': isSelectedTask(entry.task) }"
                :style="{
                  cursor: 'pointer',
                  padding: '12px 16px',
                }"
              >
                <n-flex vertical style="gap: 8px">
                  <n-flex align="center" justify="space-between">
                    <n-text strong style="font-size: 15px">{{ entry.task.entry }}</n-text>
                    <n-tag
                      size="small"
                      :type="
                        entry.task.status === 'succeeded'
                          ? 'success'
                          : entry.task.status === 'failed'
                            ? 'error'
                            : 'warning'
                      "
                    >
                      #{{ entry.index + 1 }}
                    </n-tag>
                  </n-flex>
                  <n-flex vertical style="gap: 4px">
                    <n-text depth="3" style="font-size: 12px">
                      状态:
                      <n-text
                        :type="
                          entry.task.status === 'succeeded'
                            ? 'success'
                            : entry.task.status === 'failed'
                              ? 'error'
                              : 'warning'
                        "
                      >
                        {{
                          entry.task.status === 'succeeded'
                            ? '成功'
                            : entry.task.status === 'failed'
                              ? '失败'
                              : '运行中'
                        }}
                      </n-text>
                    </n-text>
                    <n-text
                      depth="3"
                      style="font-size: 12px"
                      :title="entry.task.start_time || undefined"
                    >
                      {{ taskMetaLine(entry.task) }}
                    </n-text>
                  </n-flex>
                </n-flex>
              </n-list-item>
            </template>
          </template>
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

/* 日期分组行：横线由分隔带自己画，这里只负责去掉列表项的 hover/光标反馈 */
.n-list .task-date-divider-item {
  padding: 0;
  cursor: default;
}

.n-list .task-date-divider-item:hover {
  background-color: transparent;
}
</style>
