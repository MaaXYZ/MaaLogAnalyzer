<script setup lang="ts">
import { ref, computed } from 'vue'
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

// 跟踪哪些识别尝试的嵌套节点是展开的
const expandedAttempts = ref<Set<number>>(new Set())

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

// 切换嵌套节点的显示/隐藏
const toggleNestedNodes = (attemptIndex: number) => {
  if (expandedAttempts.value.has(attemptIndex)) {
    expandedAttempts.value.delete(attemptIndex)
  } else {
    expandedAttempts.value.add(attemptIndex)
  }
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
      <!-- Header: 节点名称按钮 + task 标签 -->
      <template #header>
        <n-flex justify="space-between" align="center">
          <n-button
            size="small"
            @click="handleNodeClick"
          >
            {{ node.name }}
          </n-button>
          <n-tag size="small">task</n-tag>
        </n-flex>
      </template>

      <!-- Content: 识别尝试历史 + Next列表 -->
      <n-flex vertical style="gap: 8px">
        <!-- 所有识别尝试（包括失败的） -->
        <n-flex wrap style="gap: 8px 12px">
          <template v-for="(attempt, idx) in node.recognition_attempts" :key="idx">
            <!-- 没有嵌套节点的识别尝试：直接显示按钮 -->
            <n-button
              v-if="!attempt.nested_nodes || attempt.nested_nodes.length === 0"
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

            <!-- 有嵌套节点的识别尝试：显示嵌套结构 -->
            <template v-else>
              <!-- 展开状态：显示 card -->
              <n-card v-if="expandedAttempts.has(idx)" size="small">
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

              <!-- 折叠状态：显示按钮 + Show 按钮 -->
              <n-flex v-else wrap style="gap: 8px 12px">
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

          <!-- Next 列表按钮（禁用状态，显示候选节点） -->
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
      </n-flex>

      <!-- Footer: 动作按钮 -->
      <template #footer v-if="node.action_details">
        <n-button
          size="small"
          :type="actionButtonType"
          ghost
          @click="handleNodeClick"
        >
          <template #icon>
            <check-circle-outlined v-if="node.action_details.success" />
            <close-circle-outlined v-else />
          </template>
          {{ node.action_details.name }}
        </n-button>
      </template>
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
