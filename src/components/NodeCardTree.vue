<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem, RecognitionAttempt } from '../types'

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded?: boolean
  actionExpanded?: boolean
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

// action 是否整体失败（含嵌套动作组失败）
const isActionFailed = computed(() => {
  if (props.node.nested_action_nodes?.some(g => g.status === 'failed')) return true
  if (props.node.action_details && !props.node.action_details.success) return true
  return false
})

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

const actionTree = computed(() => {
  const actionItems: Array<{
    groupIdx: number
    nestedIdx: number
    name: string
    status: string
    recognitionItems: RecognitionAttempt[]
    recognitionCount: number
  }> = []

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
          recognitionCount: n.recognition_attempts?.length ?? 0,
        })
      }
    }
  }

  for (const item of actionItems) {
    item.recognitionItems = dedupeRecognitionAttempts(item.recognitionItems)
    item.recognitionCount = item.recognitionItems.length
  }

  return {
    actions: actionItems,
    actionLevelReco: dedupeRecognitionAttempts(props.node.nested_recognition_in_action ?? []),
  }
})

const hasActionSection = computed(() => {
  return !!(
    props.node.action_details ||
    actionTree.value.actions.length > 0 ||
    actionTree.value.actionLevelReco.length > 0
  )
})

const hasActionChildren = computed(() => {
  return actionTree.value.actions.length > 0 || actionTree.value.actionLevelReco.length > 0
})
</script>

<template>
  <div class="tree-view">
    <!-- Recognition 树 -->
    <template v-if="mergedRecognitionList.length > 0">
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

          <!-- 未识别的节点 -->
          <n-text v-else-if="item.status === 'not-recognized'" depth="3" style="font-size: 12px; opacity: 0.5">{{ item.name }}</n-text>

          <!-- 已识别、无嵌套 -->
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

          <!-- 已识别、有嵌套 -->
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

            <!-- 嵌套识别 -->
            <ul v-if="checkExpanded(item.attemptIndex!)" class="tree-list">
              <li
                v-for="(nested, nestedIdx) in item.attempt!.nested_nodes"
                :key="`tree-nested-${idx}-${nestedIdx}`"
                class="tree-item"
              >
                <n-button
                  text
                  size="tiny"
                  :type="nested.status === 'success' ? 'success' : 'warning'"
                  @click="emit('select-nested', node, item.attemptIndex!, nestedIdx)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="nested.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ nested.name }}
                </n-button>
              </li>
            </ul>
          </template>
        </li>
      </ul>
    </template>

    <!-- Action 树 -->
    <template v-if="hasActionSection">
      <div style="margin-top: 4px">
        <n-flex align="center" style="gap: 4px">
          <span
            v-if="hasActionChildren"
            class="tree-toggle"
            :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
            @click="emit('toggle-action')"
          />
          <n-text depth="3" style="font-size: 12px">Action: </n-text>
          <n-button
            v-if="node.action_details"
            text
            size="tiny"
            :type="isActionFailed ? 'error' : 'success'"
            @click="emit('select-action', node)"
          >
            <template #icon>
              <check-circle-outlined v-if="!isActionFailed" />
              <close-circle-outlined v-else />
            </template>
            {{ node.action_details.name }}
          </n-button>
          <n-text v-else depth="3" style="font-size: 12px">sub-flow only</n-text>
        </n-flex>
      </div>

      <!-- 嵌套 action 节点 -->
      <ul v-if="isActionExpanded && (actionTree.actions.length > 0 || actionTree.actionLevelReco.length > 0)" class="tree-list">
        <li
          v-for="(item, idx) in actionTree.actionLevelReco"
          :key="`tree-action-reco-${idx}`"
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
        <li
          v-for="(item, idx) in actionTree.actions"
          :key="`tree-action-${idx}`"
          class="tree-item"
        >
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
            {{ item.name }}{{ item.recognitionCount > 0 ? ` (${item.recognitionCount})` : '' }}
          </n-button>

          <ul v-if="item.recognitionItems.length > 0" class="tree-list">
            <li
              v-for="(reco, recoIdx) in item.recognitionItems"
              :key="`tree-action-${idx}-reco-${recoIdx}`"
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
