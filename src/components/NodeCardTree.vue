<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem, RecognitionAttempt } from '../types'

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded?: boolean
  actionExpanded?: boolean
  defaultCollapseNestedActionNodes?: boolean
  isExpanded?: (attemptIndex: number) => boolean
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
  'select-action-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested-action-recognition': [node: NodeInfo, actionIndex: number, nestedIndex: number, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
}>()

// 安全访问 isExpanded，提供默认值
const checkExpanded = (attemptIndex: number) => {
  return props.isExpanded ? props.isExpanded(attemptIndex) : true
}

// 安全访问折叠状态
const isRecognitionExpanded = computed(() => props.recognitionExpanded ?? true)
const isActionExpanded = computed(() => props.actionExpanded ?? true)

const actionSectionRecoExpanded = ref<Record<number, boolean>>({})
const actionTaskExpanded = ref<Record<string, boolean>>({})
const taskGroupExpanded = ref<Record<number, boolean>>({})

const isActionSectionRecoExpanded = (index: number) => {
  return actionSectionRecoExpanded.value[index] ?? true
}

const toggleActionSectionReco = (index: number) => {
  actionSectionRecoExpanded.value[index] = !isActionSectionRecoExpanded(index)
}

const getActionTaskKey = (groupIdx: number, nestedIdx: number) => `${groupIdx}-${nestedIdx}`

const isActionTaskExpanded = (groupIdx: number, nestedIdx: number) => {
  const key = getActionTaskKey(groupIdx, nestedIdx)
  return actionTaskExpanded.value[key] ?? !(props.defaultCollapseNestedActionNodes ?? false)
}

const toggleActionTask = (groupIdx: number, nestedIdx: number) => {
  const key = getActionTaskKey(groupIdx, nestedIdx)
  actionTaskExpanded.value[key] = !isActionTaskExpanded(groupIdx, nestedIdx)
}

const isTaskGroupExpanded = (groupIdx: number) => {
  return taskGroupExpanded.value[groupIdx] ?? true
}

const toggleTaskGroup = (groupIdx: number) => {
  taskGroupExpanded.value[groupIdx] = !isTaskGroupExpanded(groupIdx)
}

watch(() => props.node?.node_id, () => {
  actionSectionRecoExpanded.value = {}
  actionTaskExpanded.value = {}
  taskGroupExpanded.value = {}
}, { flush: 'sync' })

watch(() => props.defaultCollapseNestedActionNodes, () => {
  actionTaskExpanded.value = {}
  taskGroupExpanded.value = {}
}, { flush: 'sync' })

// action 是否失败（仅看主 action）
const isActionFailed = computed(() => {
  if (props.node.action_details && !props.node.action_details.success) return true
  return false
})

interface FlattenedNestedRecognition {
  attempt: RecognitionAttempt
  flowItemId: string
  depth: number
}

interface ActionTreeItem {
  groupIdx: number
  nestedIdx: number
  name: string
  status: string
  recognitionItems: RecognitionAttempt[]
}

interface TaskGroupItem {
  groupIdx: number
  taskId: number
  name: string
  status: 'success' | 'failed'
  actions: ActionTreeItem[]
}

const dedupeRecognitionAttempts = (items: RecognitionAttempt[]) => {
  const seen = new Set<string>()
  const result: RecognitionAttempt[] = []
  for (const item of items) {
    const key = `${item.reco_id}|${item.name}|${item.timestamp}|${item.status}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

const flattenNestedRecognitionNodes = (
  attempts: RecognitionAttempt[] | undefined,
  parentFlowItemId: string,
  depth = 1
): FlattenedNestedRecognition[] => {
  if (!attempts || attempts.length === 0) return []

  const result: FlattenedNestedRecognition[] = []
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    const flowItemId = `${parentFlowItemId}.nested.${i}`
    result.push({
      attempt,
      flowItemId,
      depth,
    })
    if (attempt.nested_nodes && attempt.nested_nodes.length > 0) {
      result.push(...flattenNestedRecognitionNodes(attempt.nested_nodes, flowItemId, depth + 1))
    }
  }
  return result
}

const actionTree = computed(() => {
  const actionItems: ActionTreeItem[] = []

  if (props.node.nested_action_nodes) {
    for (let gi = 0; gi < props.node.nested_action_nodes.length; gi++) {
      const group = props.node.nested_action_nodes[gi]
      for (let ni = 0; ni < group.nested_actions.length; ni++) {
        const n = group.nested_actions[ni]
        actionItems.push({
          groupIdx: gi,
          nestedIdx: ni,
          name: n.name,
          status: n.status,
          recognitionItems: [...(n.recognition_attempts ?? [])],
        })
      }
    }
  }

  for (const item of actionItems) {
    item.recognitionItems = dedupeRecognitionAttempts(item.recognitionItems)
  }

  return {
    actions: actionItems,
    actionLevelReco: dedupeRecognitionAttempts(props.node.nested_recognition_in_action ?? []),
  }
})

const taskGroups = computed<TaskGroupItem[]>(() => {
  if (!props.node.nested_action_nodes || props.node.nested_action_nodes.length === 0) return []
  return props.node.nested_action_nodes.map((group, groupIdx) => ({
    groupIdx,
    taskId: group.task_id,
    name: group.name,
    status: group.status,
    actions: actionTree.value.actions.filter(item => item.groupIdx === groupIdx),
  }))
})

const shouldShowActionSectionRecoToggle = (attempt: RecognitionAttempt) => {
  return !!attempt.nested_nodes && attempt.nested_nodes.length > 0
}

const shouldShowActionTaskToggle = (item: ActionTreeItem) => {
  return item.recognitionItems.length > 0
}

const hasActionSectionChildren = computed(() => {
  return actionTree.value.actionLevelReco.length > 0 || actionTree.value.actions.length > 0
})

const shouldShowActionSectionToggle = computed(() => {
  return hasActionSectionChildren.value
})

const hasRecognitionSection = computed(() => {
  if (props.mergedRecognitionList.length > 0) return true
  if (!hasActionSection.value && actionTree.value.actionLevelReco.length > 0) return true
  return false
})

const hasTaskSection = computed(() => {
  return taskGroups.value.length > 0
})

const hasActionSection = computed(() => {
  return !!props.node.action_details
})

const hasStandaloneTaskSection = computed(() => {
  return hasTaskSection.value && !hasActionSection.value
})

const toTimestampMs = (timestamp?: string): number => {
  if (!timestamp) return Number.POSITIVE_INFINITY
  const normalized = timestamp.includes(' ') ? timestamp.replace(' ', 'T') : timestamp
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

const pickEarliest = (timestamps: Array<string | undefined>): number => {
  const values = timestamps.map(toTimestampMs).filter(value => Number.isFinite(value))
  return values.length > 0 ? Math.min(...values) : Number.POSITIVE_INFINITY
}

const sectionOrder = computed<Array<'recognition' | 'task' | 'action'>>(() => {
  const sections: Array<{ type: 'recognition' | 'task' | 'action'; ts: number }> = []

  if (hasRecognitionSection.value) {
    const recoTimestamps = props.node.recognition_attempts.map(attempt => attempt.timestamp)
    sections.push({
      type: 'recognition',
      ts: pickEarliest(recoTimestamps),
    })
  }

  if (hasStandaloneTaskSection.value) {
    const taskTimestamps = props.node.nested_action_nodes?.map(group => group.timestamp) ?? []
    sections.push({
      type: 'task',
      ts: pickEarliest(taskTimestamps),
    })
  }

  if (hasActionSection.value) {
    const actionTs = pickEarliest([
      props.node.action_details?.start_timestamp,
      props.node.action_details?.end_timestamp,
    ])
    sections.push({
      type: 'action',
      ts: Number.isFinite(actionTs)
        ? actionTs
        : pickEarliest([props.node.end_timestamp, props.node.timestamp]),
    })
  }

  return sections
    .sort((a, b) => a.ts - b.ts)
    .map(section => section.type)
})
</script>

<template>
  <div class="tree-view">
    <template v-for="section in sectionOrder" :key="section">
      <template v-if="section === 'recognition'">
        <n-flex align="center" style="gap: 4px; margin-bottom: 2px">
          <span
            class="tree-toggle"
            :class="{ 'tree-toggle-collapsed': !isRecognitionExpanded }"
            @click="emit('toggle-recognition')"
          />
          <n-text depth="3" style="font-size: 12px; cursor: pointer" @click="emit('toggle-recognition')">Recognition</n-text>
        </n-flex>
        <ul v-if="isRecognitionExpanded" class="tree-list">
          <li
            v-for="(item, idx) in mergedRecognitionList"
            :key="`tree-reco-${idx}`"
            :class="['tree-item', item.isRoundSeparator ? 'tree-item-round-separator' : '']"
          >
            <n-text v-if="item.isRoundSeparator" depth="3" class="tree-round-separator-text">
              {{ item.name }}
            </n-text>

            <n-text v-else-if="item.status === 'not-recognized'" depth="3" style="font-size: 12px; opacity: 0.5">{{ item.name }}</n-text>

            <template v-else-if="!item.hasNestedNodes">
              <n-button
                text
                size="tiny"
                :type="item.status === 'success' ? 'success' : 'warning'"
                @click="emit('select-recognition', node, item.attemptIndex!)"
              >
                <template #icon>
                  <check-circle-outlined v-if="item.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ item.name }}
              </n-button>
            </template>

            <template v-else>
              <n-flex align="center" style="gap: 4px">
                <span
                  class="tree-toggle"
                  :class="{ 'tree-toggle-collapsed': !checkExpanded(item.attemptIndex!) }"
                  @click="emit('toggle-nested', item.attemptIndex!)"
                />
                <n-button
                  text
                  size="tiny"
                  :type="item.status === 'success' ? 'success' : 'warning'"
                  @click="emit('select-recognition', node, item.attemptIndex!)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="item.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ item.name }}
                </n-button>
              </n-flex>

              <ul v-if="checkExpanded(item.attemptIndex!)" class="tree-list">
                <li
                  v-for="nested in flattenNestedRecognitionNodes(item.attempt!.nested_nodes, `node.recognition.${item.attemptIndex!}`)"
                  :key="`tree-nested-${idx}-${nested.flowItemId}`"
                  class="tree-item"
                >
                  <n-button
                    text
                    size="tiny"
                    :type="nested.attempt.status === 'success' ? 'success' : 'warning'"
                    :style="{ marginLeft: `${(nested.depth - 1) * 12}px` }"
                    @click="emit('select-flow-item', node, nested.flowItemId)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="nested.attempt.status === 'success'" />
                      <close-circle-outlined v-else />
                    </template>
                    {{ nested.attempt.name }}
                  </n-button>
                </li>
              </ul>
            </template>
          </li>

          <li
            v-if="!hasActionSection"
            v-for="(item, idx) in actionTree.actionLevelReco"
            :key="`tree-action-level-reco-${idx}`"
            class="tree-item"
          >
            <n-button
              text
              size="tiny"
              :type="item.status === 'success' ? 'success' : 'warning'"
              @click="emit('select-action-recognition', node, idx)"
            >
              <template #icon>
                <check-circle-outlined v-if="item.status === 'success'" />
                <close-circle-outlined v-else />
              </template>
              {{ item.name }}
            </n-button>
          </li>
        </ul>
      </template>

      <template v-else-if="section === 'task'">
        <div style="margin-top: 4px">
          <n-flex align="center" style="gap: 4px">
            <span
              class="tree-toggle"
              :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
              @click="emit('toggle-action')"
            />
            <n-text depth="3" style="font-size: 12px; cursor: pointer" @click="emit('toggle-action')">Task</n-text>
          </n-flex>
        </div>

        <ul v-if="isActionExpanded && taskGroups.length > 0" class="tree-list">
          <li
            v-for="group in taskGroups"
            :key="`tree-task-group-${group.groupIdx}-${group.taskId}`"
            class="tree-item"
          >
            <n-flex align="center" style="gap: 4px">
              <span
                v-if="group.actions.length > 0"
                class="tree-toggle"
                :class="{ 'tree-toggle-collapsed': !isTaskGroupExpanded(group.groupIdx) }"
                @click="toggleTaskGroup(group.groupIdx)"
              />
              <n-button
                text
                size="tiny"
                :type="group.status === 'success' ? 'success' : 'error'"
                @click="emit('select-flow-item', node, `node.task.${group.groupIdx}.${group.taskId}`)"
              >
                <template #icon>
                  <check-circle-outlined v-if="group.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ group.name }}
              </n-button>
            </n-flex>

            <ul
              v-if="group.actions.length > 0 && isTaskGroupExpanded(group.groupIdx)"
              class="tree-list"
            >
              <li
                v-for="item in group.actions"
                :key="`tree-task-group-${group.groupIdx}-action-${item.nestedIdx}`"
                class="tree-item"
              >
                <n-flex align="center" style="gap: 4px">
                  <span
                    v-if="item.recognitionItems.length > 0"
                    class="tree-toggle"
                    :class="{ 'tree-toggle-collapsed': !isActionTaskExpanded(item.groupIdx, item.nestedIdx) }"
                    @click="toggleActionTask(item.groupIdx, item.nestedIdx)"
                  />
                  <n-button
                    text
                    size="tiny"
                    :type="item.status === 'success' ? 'success' : 'error'"
                    @click="emit('select-nested-action', node, item.groupIdx, item.nestedIdx)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="item.status === 'success'" />
                      <close-circle-outlined v-else />
                    </template>
                    {{ item.name }}
                  </n-button>
                </n-flex>

                <ul
                  v-if="item.recognitionItems.length > 0 && isActionTaskExpanded(item.groupIdx, item.nestedIdx)"
                  class="tree-list"
                >
                  <li
                    v-for="(reco, recoIdx) in item.recognitionItems"
                    :key="`tree-task-group-${group.groupIdx}-action-${item.nestedIdx}-reco-${recoIdx}`"
                    class="tree-item"
                  >
                    <n-button
                      text
                      size="tiny"
                      :type="reco.status === 'success' ? 'success' : 'warning'"
                      @click="emit('select-nested-action-recognition', node, item.groupIdx, item.nestedIdx, recoIdx)"
                    >
                      <template #icon>
                        <check-circle-outlined v-if="reco.status === 'success'" />
                        <close-circle-outlined v-else />
                      </template>
                      {{ reco.name }}
                    </n-button>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </template>

      <template v-else-if="section === 'action'">
        <div style="margin-top: 4px">
          <n-flex align="center" style="gap: 4px">
            <span
              v-if="shouldShowActionSectionToggle"
              class="tree-toggle"
              :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
              @click="emit('toggle-action')"
            />
            <n-text depth="3" style="font-size: 12px">Action:</n-text>
            <n-button
              text
              size="tiny"
              :type="isActionFailed ? 'error' : 'success'"
              @click="emit('select-action', node)"
            >
              <template #icon>
                <check-circle-outlined v-if="!isActionFailed" />
                <close-circle-outlined v-else />
              </template>
              {{ node.action_details!.name }}
            </n-button>
          </n-flex>
        </div>
        <ul
          v-if="isActionExpanded && (actionTree.actionLevelReco.length > 0 || actionTree.actions.length > 0)"
          class="tree-list"
        >
          <li
            v-for="(item, idx) in actionTree.actionLevelReco"
            :key="`tree-action-section-reco-${idx}`"
            class="tree-item"
          >
            <n-flex align="center" style="gap: 4px">
              <span
                v-if="shouldShowActionSectionRecoToggle(item)"
                class="tree-toggle"
                :class="{ 'tree-toggle-collapsed': !isActionSectionRecoExpanded(idx) }"
                @click="toggleActionSectionReco(idx)"
              />
              <n-button
                text
                size="tiny"
                :type="item.status === 'success' ? 'success' : 'warning'"
                @click="emit('select-action-recognition', node, idx)"
              >
                <template #icon>
                  <check-circle-outlined v-if="item.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ item.name }}
              </n-button>
            </n-flex>

            <ul
              v-if="item.nested_nodes && item.nested_nodes.length > 0 && isActionSectionRecoExpanded(idx)"
              class="tree-list"
            >
              <li
                v-for="nested in flattenNestedRecognitionNodes(item.nested_nodes, `node.action.recognition.${idx}`)"
                :key="`tree-action-section-reco-nested-${idx}-${nested.flowItemId}`"
                class="tree-item"
              >
                <n-button
                  text
                  size="tiny"
                  :type="nested.attempt.status === 'success' ? 'success' : 'warning'"
                  :style="{ marginLeft: `${(nested.depth - 1) * 12}px` }"
                  @click="emit('select-flow-item', node, nested.flowItemId)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="nested.attempt.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ nested.attempt.name }}
                </n-button>
              </li>
            </ul>
          </li>

          <li
            v-for="group in taskGroups"
            :key="`tree-action-section-task-group-${group.groupIdx}-${group.taskId}`"
            class="tree-item"
          >
            <n-flex align="center" style="gap: 4px">
              <span
                v-if="group.actions.length > 0"
                class="tree-toggle"
                :class="{ 'tree-toggle-collapsed': !isTaskGroupExpanded(group.groupIdx) }"
                @click="toggleTaskGroup(group.groupIdx)"
              />
              <n-button
                text
                size="tiny"
                :type="group.status === 'success' ? 'success' : 'error'"
                @click="emit('select-flow-item', node, `node.task.${group.groupIdx}.${group.taskId}`)"
              >
                <template #icon>
                  <check-circle-outlined v-if="group.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ group.name }}
              </n-button>
            </n-flex>

            <ul
              v-if="group.actions.length > 0 && isTaskGroupExpanded(group.groupIdx)"
              class="tree-list"
            >
              <li
                v-for="(item, idx) in group.actions"
                :key="`tree-action-section-task-${group.groupIdx}-${idx}`"
                class="tree-item"
              >
                <n-flex align="center" style="gap: 4px">
                  <span
                    v-if="shouldShowActionTaskToggle(item)"
                    class="tree-toggle"
                    :class="{ 'tree-toggle-collapsed': !isActionTaskExpanded(item.groupIdx, item.nestedIdx) }"
                    @click="toggleActionTask(item.groupIdx, item.nestedIdx)"
                  />
                  <n-button
                    text
                    size="tiny"
                    :type="item.status === 'success' ? 'success' : 'error'"
                    @click="emit('select-nested-action', node, item.groupIdx, item.nestedIdx)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="item.status === 'success'" />
                      <close-circle-outlined v-else />
                    </template>
                    {{ item.name }}
                  </n-button>
                </n-flex>

                <ul
                  v-if="item.recognitionItems.length > 0 && isActionTaskExpanded(item.groupIdx, item.nestedIdx)"
                  class="tree-list"
                >
                  <li
                    v-for="(reco, recoIdx) in item.recognitionItems"
                    :key="`tree-action-section-task-${group.groupIdx}-${idx}-reco-${recoIdx}`"
                    class="tree-item"
                  >
                    <n-button
                      text
                      size="tiny"
                      :type="reco.status === 'success' ? 'success' : 'warning'"
                      @click="emit('select-nested-action-recognition', node, item.groupIdx, item.nestedIdx, recoIdx)"
                    >
                      <template #icon>
                        <check-circle-outlined v-if="reco.status === 'success'" />
                        <close-circle-outlined v-else />
                      </template>
                      {{ reco.name }}
                    </n-button>

                    <ul v-if="reco.nested_nodes && reco.nested_nodes.length > 0" class="tree-list">
                      <li
                        v-for="nested in flattenNestedRecognitionNodes(reco.nested_nodes, `task.${item.groupIdx}.action.${item.nestedIdx}.reco.${recoIdx}`)"
                        :key="`tree-action-section-task-${group.groupIdx}-${idx}-reco-${recoIdx}-nested-${nested.flowItemId}`"
                        class="tree-item"
                      >
                        <n-button
                          text
                          size="tiny"
                          :type="nested.attempt.status === 'success' ? 'success' : 'warning'"
                          :style="{ marginLeft: `${(nested.depth - 1) * 12}px` }"
                          @click="emit('select-flow-item', node, nested.flowItemId)"
                        >
                          <template #icon>
                            <check-circle-outlined v-if="nested.attempt.status === 'success'" />
                            <close-circle-outlined v-else />
                          </template>
                          {{ nested.attempt.name }}
                        </n-button>
                      </li>
                    </ul>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
.tree-view {
  font-size: 13px;
}

.tree-toggle {
  display: inline-block;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 5px 0 5px 8px;
  border-color: transparent transparent transparent currentColor;
  cursor: pointer;
  transition: transform 0.2s;
  transform: rotate(90deg);
  flex-shrink: 0;
}

.tree-toggle-collapsed {
  transform: rotate(0deg);
}

.tree-list {
  list-style: none;
  margin: 0;
  padding-left: 16px;
  position: relative;
}

.tree-list::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 0;
  bottom: 12px;
  border-left: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.12));
}

.tree-item {
  position: relative;
  padding: 2px 0;
  padding-left: 8px;
}

.tree-item::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 12px;
  width: 12px;
  border-bottom: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.12));
}

.tree-item-round-separator {
  padding-top: 6px;
  padding-bottom: 4px;
}

.tree-item-round-separator::before {
  border-bottom: none;
}

.tree-round-separator-text {
  display: block;
  font-size: 12px;
  text-align: center;
  letter-spacing: 0.5px;
  opacity: 0.9;
}
</style>
