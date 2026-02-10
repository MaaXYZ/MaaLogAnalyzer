<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NCard, NButton, NFlex, NTag } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo } from '../types'

const props = defineProps<{
  node: NodeInfo
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
}>()

// 跟踪哪些识别尝试的嵌套节点是展开的（使用 Map 优化性能）
const expandedAttempts = ref<Map<number, boolean>>(new Map())

// 跟踪哪些 nested_recognition_in_action 的嵌套节点是展开的
const expandedNestedRecognitions = ref<Map<number, boolean>>(new Map())

// 跟踪哪些 nested_action_nodes 的嵌套节点是展开的
const expandedNestedActions = ref<Map<number, boolean>>(new Map())

// 监听node变化，清空展开状态
watch(() => props.node?.node_id, () => {
  expandedAttempts.value.clear()
  expandedNestedRecognitions.value.clear()
  expandedNestedActions.value.clear()
}, { flush: 'sync' })

// 节点状态样式
const cardClass = computed(() => {
  return `node-card node-card-${props.node.status}`
})

// 点击节点
const handleNodeClick = () => {
  emit('select-node', props.node)
}

// 点击识别尝试
const handleRecognitionClick = (attemptIndex: number) => {
  emit('select-recognition', props.node, attemptIndex)
}

// 点击嵌套节点
const handleNestedClick = (attemptIndex: number, nestedIndex: number) => {
  emit('select-nested', props.node, attemptIndex, nestedIndex)
}

// 切换嵌套节点的显示/隐藏（优化：避免创建新对象）
const toggleNestedNodes = (attemptIndex: number) => {
  const current = expandedAttempts.value.get(attemptIndex)
  expandedAttempts.value.set(attemptIndex, !current)
}

// 切换 nested_recognition_in_action 的显示/隐藏
const toggleNestedRecognition = (index: number) => {
  const current = expandedNestedRecognitions.value.get(index)
  expandedNestedRecognitions.value.set(index, !current)
}

// 切换 nested_action_nodes 的显示/隐藏
const toggleNestedAction = (index: number) => {
  const current = expandedNestedActions.value.get(index)
  expandedNestedActions.value.set(index, !current)
}

// 检查节点是否展开
const isExpanded = (attemptIndex: number) => {
  return expandedAttempts.value.get(attemptIndex) || false
}

// 检查 nested_recognition 是否展开
const isNestedRecognitionExpanded = (index: number) => {
  return expandedNestedRecognitions.value.get(index) || false
}

// 检查 nested_action 是否展开
const isNestedActionExpanded = (index: number) => {
  return expandedNestedActions.value.get(index) || false
}

// 格式化 Next 列表项名称
const formatNextName = (item: any) => {
  let prefix = ''
  if (item.jump_back) prefix += '[JumpBack] '
  if (item.anchor) prefix += '[Anchor] '
  return prefix + item.name
}

// 动作按钮类型
const actionButtonType = computed(() => {
  if (!props.node.action_details) return 'default'
  return props.node.action_details.success ? 'success' : 'error'
})
</script>

<template>
  <div :class="cardClass">
    <n-card
      size="small"
      :bordered="true"
    >
      <!-- Header: 节点名称按钮 + PipelineNode 标签 -->
      <template #header>
        <n-flex justify="space-between" align="center">
          <n-button
            size="small"
            @click="handleNodeClick"
          >
            {{ node.name }}
          </n-button>
          <n-tag size="small">PipelineNode</n-tag>
        </n-flex>
      </template>

      <!-- Content: 执行流程 Recognition → Action → Next List -->
      <n-flex vertical style="gap: 12px">
        <!-- Recognition 部分 -->
        <n-card v-if="node.recognition_attempts && node.recognition_attempts.length > 0" size="small" title="Recognition">
          <n-flex vertical style="gap: 8px">
            <template v-for="(attempt, idx) in node.recognition_attempts" :key="`attempt-${idx}`">
              <!-- 没有嵌套节点的识别尝试：直接显示按钮 -->
              <n-button
                v-if="!attempt.nested_nodes || attempt.nested_nodes.length === 0"
                size="small"
                :type="attempt.status === 'success' ? 'success' : 'warning'"
                ghost
                @click="handleRecognitionClick(idx)"
                style="align-self: flex-start"
              >
                <template #icon>
                  <check-circle-outlined v-if="attempt.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ attempt.name }}
              </n-button>

              <!-- 有嵌套节点的识别尝试：显示嵌套结构 -->
              <template v-else>
                <!-- 展开状态 -->
                <n-card v-if="isExpanded(idx)" size="small">
                  <template #header>
                    <n-flex align="center" style="gap: 8px">
                      <n-button
                        size="small"
                        :type="attempt.status === 'success' ? 'success' : 'warning'"
                        ghost
                        @click="handleRecognitionClick(idx)"
                      >
                        <template #icon>
                          <check-circle-outlined v-if="attempt.status === 'success'" />
                          <close-circle-outlined v-else />
                        </template>
                        {{ attempt.name }}
                      </n-button>
                      <n-button size="small" @click="toggleNestedNodes(idx)">
                        Hide
                      </n-button>
                    </n-flex>
                  </template>

                  <n-flex wrap style="gap: 8px 12px">
                    <n-button
                      v-for="(nested, nestedIdx) in attempt.nested_nodes"
                      :key="`nested-${idx}-${nestedIdx}`"
                      size="small"
                      :type="nested.status === 'success' ? 'success' : 'warning'"
                      ghost
                      @click="handleNestedClick(idx, nestedIdx)"
                    >
                      <template #icon>
                        <check-circle-outlined v-if="nested.status === 'success'" />
                        <close-circle-outlined v-else />
                      </template>
                      {{ nested.name }}
                    </n-button>
                  </n-flex>
                </n-card>

                <!-- 折叠状态 -->
                <n-flex v-else align="center" style="gap: 8px">
                  <n-button
                    size="small"
                    :type="attempt.status === 'success' ? 'success' : 'warning'"
                    ghost
                    @click="handleRecognitionClick(idx)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="attempt.status === 'success'" />
                      <close-circle-outlined v-else />
                    </template>
                    {{ attempt.name }}
                  </n-button>
                  <n-button size="small" @click="toggleNestedNodes(idx)">
                    Show
                  </n-button>
                </n-flex>
              </template>
            </template>
          </n-flex>
        </n-card>

        <!-- Action 部分 -->
        <n-card v-if="node.action_details || (node.nested_recognition_in_action && node.nested_recognition_in_action.length > 0) || (node.nested_action_nodes && node.nested_action_nodes.length > 0)" size="small" title="Action">
          <n-flex vertical style="gap: 8px">
            <!-- Action 按钮 -->
            <n-button
              v-if="node.action_details"
              size="small"
              :type="actionButtonType"
              ghost
              @click="handleNodeClick"
              style="align-self: flex-start"
            >
              <template #icon>
                <check-circle-outlined v-if="node.action_details.success" />
                <close-circle-outlined v-else />
              </template>
              {{ node.action_details.name }}
            </n-button>

            <!-- Custom Action 中的嵌套识别节点 -->
            <template v-if="node.nested_recognition_in_action && node.nested_recognition_in_action.length > 0">
              <template v-for="(nestedReco, idx) in node.nested_recognition_in_action" :key="`nested-reco-${idx}`">
                <!-- 没有嵌套节点的识别：直接显示按钮 -->
                <n-button
                  v-if="!nestedReco.nested_nodes || nestedReco.nested_nodes.length === 0"
                  size="small"
                  :type="nestedReco.status === 'success' ? 'success' : 'warning'"
                  ghost
                  style="align-self: flex-start"
                >
                  <template #icon>
                    <check-circle-outlined v-if="nestedReco.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ nestedReco.name }}
                </n-button>

                <!-- 有嵌套节点的识别：显示嵌套结构 -->
                <template v-else>
                  <!-- 展开状态 -->
                  <n-card v-if="isNestedRecognitionExpanded(idx)" size="small">
                    <template #header>
                      <n-flex align="center" style="gap: 8px">
                        <n-button
                          size="small"
                          :type="nestedReco.status === 'success' ? 'success' : 'warning'"
                          ghost
                        >
                          <template #icon>
                            <check-circle-outlined v-if="nestedReco.status === 'success'" />
                            <close-circle-outlined v-else />
                          </template>
                          {{ nestedReco.name }}
                        </n-button>
                        <n-button size="small" @click="toggleNestedRecognition(idx)">
                          Hide
                        </n-button>
                      </n-flex>
                    </template>

                    <n-flex wrap style="gap: 8px 12px">
                      <n-button
                        v-for="(nested, nestedIdx) in nestedReco.nested_nodes"
                        :key="`nested-reco-inner-${idx}-${nestedIdx}`"
                        size="small"
                        :type="nested.status === 'success' ? 'success' : 'warning'"
                        ghost
                      >
                        <template #icon>
                          <check-circle-outlined v-if="nested.status === 'success'" />
                          <close-circle-outlined v-else />
                        </template>
                        {{ nested.name }}
                      </n-button>
                    </n-flex>
                  </n-card>

                  <!-- 折叠状态 -->
                  <n-flex v-else align="center" style="gap: 8px">
                    <n-button
                      size="small"
                      :type="nestedReco.status === 'success' ? 'success' : 'warning'"
                      ghost
                    >
                      <template #icon>
                        <check-circle-outlined v-if="nestedReco.status === 'success'" />
                        <close-circle-outlined v-else />
                      </template>
                      {{ nestedReco.name }}
                    </n-button>
                    <n-button size="small" @click="toggleNestedRecognition(idx)">
                      Show
                    </n-button>
                  </n-flex>
                </template>
              </template>
            </template>

            <!-- Custom Action 中的嵌套动作节点 -->
            <template v-if="node.nested_action_nodes && node.nested_action_nodes.length > 0">
              <template v-for="(nestedAction, idx) in node.nested_action_nodes" :key="`nested-action-${idx}`">
                <!-- 没有嵌套节点的动作：直接显示按钮 -->
                <n-button
                  v-if="!nestedAction.nested_actions || nestedAction.nested_actions.length === 0"
                  size="small"
                  :type="nestedAction.status === 'success' ? 'success' : 'warning'"
                  ghost
                  style="align-self: flex-start"
                >
                  <template #icon>
                    <check-circle-outlined v-if="nestedAction.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ nestedAction.name }}
                </n-button>

                <!-- 有嵌套节点的动作：显示嵌套结构 -->
                <template v-else>
                  <!-- 展开状态 -->
                  <n-card v-if="isNestedActionExpanded(idx)" size="small">
                    <template #header>
                      <n-flex align="center" style="gap: 8px">
                        <n-button
                          size="small"
                          :type="nestedAction.status === 'success' ? 'success' : 'warning'"
                          ghost
                        >
                          <template #icon>
                            <check-circle-outlined v-if="nestedAction.status === 'success'" />
                            <close-circle-outlined v-else />
                          </template>
                          {{ nestedAction.name }}
                        </n-button>
                        <n-button size="small" @click="toggleNestedAction(idx)">
                          Hide
                        </n-button>
                      </n-flex>
                    </template>

                    <n-flex wrap style="gap: 8px 12px">
                      <n-button
                        v-for="(nested, nestedIdx) in nestedAction.nested_actions"
                        :key="`nested-action-inner-${idx}-${nestedIdx}`"
                        size="small"
                        :type="nested.status === 'success' ? 'success' : 'warning'"
                        ghost
                      >
                        <template #icon>
                          <check-circle-outlined v-if="nested.status === 'success'" />
                          <close-circle-outlined v-else />
                        </template>
                        {{ nested.name }}
                      </n-button>
                    </n-flex>
                  </n-card>

                  <!-- 折叠状态 -->
                  <n-flex v-else align="center" style="gap: 8px">
                    <n-button
                      size="small"
                      :type="nestedAction.status === 'success' ? 'success' : 'warning'"
                      ghost
                    >
                      <template #icon>
                        <check-circle-outlined v-if="nestedAction.status === 'success'" />
                        <close-circle-outlined v-else />
                      </template>
                      {{ nestedAction.name }}
                    </n-button>
                    <n-button size="small" @click="toggleNestedAction(idx)">
                      Show
                    </n-button>
                  </n-flex>
                </template>
              </template>
            </template>
          </n-flex>
        </n-card>

        <!-- Next List 部分 -->
        <n-card v-if="node.next_list && node.next_list.length > 0" size="small" title="Next List">
          <n-flex wrap style="gap: 8px 12px">
            <n-button
              v-for="(nextNode, idx) in node.next_list"
              :key="`next-${idx}`"
              size="small"
              ghost
              disabled
            >
              {{ formatNextName(nextNode) }}
            </n-button>
          </n-flex>
        </n-card>
      </n-flex>
    </n-card>
  </div>
</template>

<style scoped>
.node-card {
  position: relative;
  padding-left: 20px;
  transition: all 0.3s;
}

.node-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #18181c;
}

.node-card-success::before {
  background: #63e2b7;
}

.node-card-failed::before {
  background: #d03050;
}

.node-card:hover {
  transform: translateX(4px);
}

.node-card :deep(.n-card) {
  transition: box-shadow 0.3s;
}

.node-card:hover :deep(.n-card) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
</style>
