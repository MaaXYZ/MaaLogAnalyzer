<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NCard, NFlex, NText, NButton, NIcon, NScrollbar, NList, NListItem, NTag } from 'naive-ui'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MenuFoldOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
} from '@vicons/antd'
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
    // 折叠入口：展开态的把手放在标题栏里（竖排把手只在收起后才出现）
    onToggleTaskList?: () => void
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
// NScrollbar 的模板 ref 拿到的是组件实例，不是 DOM 元素：之前的 .$el 强转
// 在这里恒为 undefined/非元素，导致「把选中任务卡滚进视野」每次都抛
// "querySelectorAll is not a function" 而静默失效。用一层真实 DOM 包裹取根节点。
const taskListContentRef = ref<HTMLElement | null>(null)

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

// 键盘切换任务（[ / ]）或“失败于 X”跳转后，把当前任务卡带进视野；已经可见就不动。
// 延迟到下一帧执行：先让选中态与时间线/详情的更新呈现出来，跟随滚动不占关键帧。
watch(
  () => props.activeTaskIndex,
  async (index) => {
    await nextTick()
    requestAnimationFrame(() => {
      const root = taskListContentRef.value
      if (!root) return

      const row = Array.from(root.querySelectorAll<HTMLElement>('[data-task-index]')).find(
        (element) => Number(element.dataset.taskIndex) === index,
      )
      row?.scrollIntoView({ block: 'nearest' })
    })
  },
  { flush: 'post' },
)

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
          <n-button
            v-if="props.onToggleTaskList"
            text
            size="tiny"
            title="收起任务列表"
            aria-label="收起任务列表"
            @click="props.onToggleTaskList?.()"
          >
            <n-icon size="16"><menu-fold-outlined /></n-icon>
          </n-button>
        </n-flex>
      </n-flex>
    </template>
    <n-scrollbar
      ref="taskListScrollbar"
      style="height: 100%; max-height: 100%"
      @wheel.passive="handleWheel"
    >
      <div ref="taskListContentRef">
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
              <!-- 键盘可达：li 本身可聚焦并响应 Enter/Space。这里不加 role="button"——
                   li 上放 button 是非法 ARIA（axe: aria-allowed-role），而且卡片里还有
                   「失败于 X」这个真按钮，<div class="n-card"> 会变成嵌套交互控件。 -->
              <n-list-item
                v-for="entry in group.items"
                :key="`${buildTaskIdentity(entry.task)}-${entry.index}`"
                @click="emit('select-task', entry.index)"
                @keydown.enter.prevent="emit('select-task', entry.index)"
                @keydown.space.prevent="emit('select-task', entry.index)"
                :class="{ 'task-list-item-selected': props.activeTaskIndex === entry.index }"
                :data-task-index="entry.index"
                tabindex="0"
                :aria-current="props.activeTaskIndex === entry.index ? 'true' : undefined"
                :title="`${entry.task.entry}（${statusMeta(entry.task).label}）`"
                :style="{
                  cursor: 'pointer',
                  padding: '12px 16px',
                }"
              >
                <n-flex vertical style="gap: 6px">
                  <!-- 不换行：任务名一长，右侧 #序号 会被挤到第二行，任务卡高度就参差了 -->
                  <n-flex align="center" justify="space-between" :wrap="false" style="gap: 8px">
                    <n-flex align="center" :wrap="false" style="gap: 6px; min-width: 0">
                      <n-icon
                        class="task-card-status-icon"
                        :class="`task-card-status-icon--${statusMeta(entry.task).type}`"
                        :size="15"
                        aria-hidden="true"
                      >
                        <check-circle-outlined v-if="entry.task.status === 'succeeded'" />
                        <close-circle-outlined v-else-if="entry.task.status === 'failed'" />
                        <clock-circle-outlined v-else />
                      </n-icon>
                      <n-text strong class="task-card-title">{{ entry.task.entry }}</n-text>
                    </n-flex>
                    <!-- #序号 只是编号，不再用状态色：状态已由图标 + 状态词表达，
                         而且状态色当文字色只有 3.1–3.6:1，不达标 -->
                    <n-tag size="small" class="task-card-index"> #{{ entry.index + 1 }} </n-tag>
                  </n-flex>

                  <!-- 状态、节点数、耗时、开始时间并成一行：三行卡 -> 两行卡，一屏多看几个任务。
                       状态词用 --app-status-*-text（对底色 ≥4.5:1），图形色留给图标。 -->
                  <n-text
                    depth="3"
                    style="font-size: 12px"
                    :title="entry.task.start_time || undefined"
                  >
                    <span
                      :class="`task-card-status-text task-card-status-text--${statusMeta(entry.task).type}`"
                    >
                      {{ statusMeta(entry.task).label }}
                    </span>
                    <span class="task-card-meta-sep"> · </span>
                    {{ taskMetaLine(entry.task) }}
                  </n-text>

                  <n-button
                    v-if="getFailureJump(entry.index)"
                    text
                    size="tiny"
                    type="error"
                    class="task-card-failure-jump"
                    title="点击定位到失败节点"
                    @click.stop="
                      emit('locate-failure', entry.index, getFailureJump(entry.index)?.nodeId ?? -1)
                    "
                  >
                    失败于 {{ getFailureJump(entry.index)?.label }}
                  </n-button>
                </n-flex>
              </n-list-item>
            </template>
          </template>
        </n-list>
      </div>
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

/* n-list-item 内部是 flex 行，`.n-list-item__main` 的自动最小尺寸按 min-content 算：
   长节点名 + nowrap 会把卡片内容顶出容器（按钮 226px > 卡片 219px，文字被卡片边缘硬裁，
   省略号永远不出现）。显式允许它收缩，省略号才生效。 */
.n-list :deep(.n-list-item__main) {
  min-width: 0;
}

/* 任务卡现在可用 Tab 直达，必须有可见焦点反馈（全局 :focus-visible 兜底也覆盖了，
   这里把环画在内侧，避免被 n-list 的圆角裁掉） */
.n-list .n-list-item[tabindex]:focus-visible {
  outline: 2px solid var(--n-color-target);
  outline-offset: -2px;
  border-radius: 2px;
}

/* 日期分组行：横线由分隔带自己画，这里只负责去掉列表项的 hover/光标反馈 */
.n-list .task-date-divider-item {
  padding: 0;
  cursor: default;
}

.n-list .task-date-divider-item:hover {
  background-color: transparent;
}

/* 任务名占满剩余宽度后省略，右侧 #序号 永不被挤走。
   n-text 默认是 inline，text-overflow 不生效，必须给成块级盒。 */
.task-card-title {
  display: block;
  font-size: 15px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card-index {
  flex-shrink: 0;
}

/* 状态不只靠颜色：图标 + 状态词 + 标签色三重表达 */
.task-card-status-icon {
  flex-shrink: 0;
}

.task-card-status-icon--success {
  color: var(--app-status-success);
}

.task-card-status-icon--error {
  color: var(--app-status-failed);
}

.task-card-status-icon--warning {
  color: var(--app-status-warning);
}

.task-card-status-icon--default {
  color: var(--app-status-neutral);
}

/* 文字用 -text 变体：语义色直接当文字色只有 3.1–3.6:1，这里换一套过 4.5:1 的深/浅色值 */
.task-card-status-text {
  font-weight: 500;
}

.task-card-status-text--success {
  color: var(--app-status-success-text);
}

.task-card-status-text--error {
  color: var(--app-status-failed-text);
}

.task-card-status-text--warning {
  color: var(--app-status-warning-text);
}

.task-card-status-text--default {
  color: var(--app-status-neutral);
}

.task-card-meta-sep {
  opacity: 0.6;
}

/* 「失败于 X」是跳转入口，按链接而不是标签呈现，点得到才有意义。
   min-width:0 必须有：flex 列的 auto 最小尺寸是 min-content，长节点名会撑破卡片，
   于是文字被卡片边缘硬裁而不是出现省略号。 */
.task-card-failure-jump {
  display: block;
  justify-content: flex-start;
  padding: 0;
  height: auto;
  font-size: 12px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  text-align: left;
}

.task-card-failure-jump :deep(.n-button__content) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
