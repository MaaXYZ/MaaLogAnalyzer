<script setup lang="ts">
import { computed, ref } from 'vue'
import { NCard, NFlex, NText, NButton, NIcon, NScrollbar, NList, NListItem, NTag } from 'naive-ui'
import { VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@vicons/antd'
import type { TaskInfo } from '../../../types'
import TaskDateDivider from '../../../components/TaskDateDivider.vue'
import { buildTaskDateGroups, buildTaskMetaLine } from '../../../utils/taskListFormat'
import { useTaskGroupCollapse } from '../../../composables/useTaskGroupCollapse'
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

// 按开始日期分组，日期用 badge 只在每组开头显示一次（跨天日志会出现多个分组）
const taskGroups = computed(() => buildTaskDateGroups(props.tasks))

// 分组可以点击折叠/展开
const { isCollapsed, toggleGroup } = useTaskGroupCollapse({
  groups: taskGroups,
  activeIndex: computed(() => props.activeTaskIndex),
})

// 节点数 / 耗时 / 时间 并成一行，任务卡从 5 行降到 3 行，一屏能多放几个任务
const taskMetaLine = (task: TaskInfo): string =>
  buildTaskMetaLine({
    nodeCount: task.nodes.length,
    duration: task.duration,
    startTime: task.start_time,
  })

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
              :key="`${buildTaskIdentity(entry.task)}-${entry.index}`"
              @click="emit('select-task', entry.index)"
              :class="{ 'task-list-item-selected': props.activeTaskIndex === entry.index }"
              :style="{
                cursor: 'pointer',
                padding: '12px 16px',
              }"
            >
              <n-flex vertical style="gap: 8px">
                <n-flex align="center" justify="space-between">
                  <n-text strong style="font-size: 15px">{{ entry.task.entry }}</n-text>
                  <n-tag size="small" :type="statusMeta(entry.task).type">
                    #{{ entry.index + 1 }}
                  </n-tag>
                </n-flex>

                <n-flex vertical style="gap: 4px">
                  <n-text depth="3" style="font-size: 12px">
                    状态:
                    <n-text :type="statusMeta(entry.task).type">
                      {{ statusMeta(entry.task).label }}
                    </n-text>
                    <template v-if="getFailureJump(entry.index)">
                      <n-text depth="3"> · 失败于 </n-text>
                      <n-tag
                        size="small"
                        type="error"
                        :bordered="false"
                        style="cursor: pointer"
                        title="点击定位到失败节点"
                        @click.stop="
                          emit(
                            'locate-failure',
                            entry.index,
                            getFailureJump(entry.index)?.nodeId ?? -1,
                          )
                        "
                      >
                        {{ getFailureJump(entry.index)?.label }}
                      </n-tag>
                    </template>
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
  </n-card>
</template>

<style scoped>
/* 选中态用主色浅底 + 左侧色条。
   不要用满铺的主色：卡片内的状态文字（success 类型）用的就是同一个主色，
   满铺后文字与底色同色，深色主题下会完全看不见。 */
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
