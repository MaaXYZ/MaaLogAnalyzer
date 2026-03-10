<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem } from '../types'

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

// 扁平化的 nested action 节点列表
const flatNestedActions = computed(() => {
  const result: Array<{ groupIdx: number; nestedIdx: number; name: string; status: string }> = []
  if (props.node.nested_action_nodes) {
    for (let gi = 0; gi < props.node.nested_action_nodes.length; gi++) {
      const group = props.node.nested_action_nodes[gi]
      for (let ni = 0; ni < group.nested_actions.length; ni++) {
        const n = group.nested_actions[ni]
        result.push({ groupIdx: gi, nestedIdx: ni, name: n.name, status: n.status })
      }
    }
  }
  return result
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
          class="tree-item"
        >
          <!-- 未识别的节点 -->
          <n-text v-if="item.status === 'not-recognized'" depth="3" style="font-size: 12px; opacity: 0.5">{{ item.name }}</n-text>

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
    <template v-if="node.action_details">
      <div style="margin-top: 4px">
        <n-flex align="center" style="gap: 4px">
          <span
            v-if="flatNestedActions.length > 0"
            class="tree-toggle"
            :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
            @click="emit('toggle-action')"
          />
          <n-text depth="3" style="font-size: 12px">Action: </n-text>
          <n-button
            text
            size="tiny"
            :type="node.action_details.success ? 'success' : 'error'"
            @click="emit('select-action', node)"
          >
            <template #icon>
              <check-circle-outlined v-if="node.action_details.success" />
              <close-circle-outlined v-else />
            </template>
            {{ node.action_details.name }}
          </n-button>
        </n-flex>
      </div>

      <!-- 嵌套 action 节点 -->
      <ul v-if="isActionExpanded && flatNestedActions.length > 0" class="tree-list">
        <li
          v-for="(item, idx) in flatNestedActions"
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
            {{ item.name }}
          </n-button>
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
</style>
