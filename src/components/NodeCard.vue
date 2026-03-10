<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NCard, NButton, NFlex, NTag, NImage } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo } from '../types'
import { isTauri } from '../utils/platform'

// 转换文件路径为可访问的 URL
const convertFileSrc = (filePath: string) => {
  if (!isTauri()) return filePath
  return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
}

const props = defineProps<{
  node: NodeInfo
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
}>()

// 跟踪哪些识别尝试的嵌套节点是展开的（使用 Map 优化性能）
const expandedAttempts = ref<Map<number, boolean>>(new Map())

// 跟踪 Action 部分是否展开
const actionExpanded = ref(false)

// 监听node变化，清空展开状态
watch(() => props.node?.node_id, () => {
  expandedAttempts.value.clear()
  actionExpanded.value = false
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

// 检查节点是否展开
const isExpanded = (attemptIndex: number) => {
  return expandedAttempts.value.get(attemptIndex) || false
}

// 合并 next_list 和 recognition_attempts
interface MergedRecognitionItem {
  name: string
  status: 'success' | 'failed' | 'not-recognized'
  attemptIndex?: number  // 在 recognition_attempts 中的索引
  attempt?: any  // 原始 attempt 对象
  hasNestedNodes?: boolean
}

const mergedRecognitionList = computed<MergedRecognitionItem[]>(() => {
  const result: MergedRecognitionItem[] = []
  
  // 构建识别尝试的 Map，按名称索引
  const attemptMap = new Map<string, { attempt: any, index: number }>()
  if (props.node.recognition_attempts) {
    props.node.recognition_attempts.forEach((attempt, idx) => {
      // 如果同名节点有多次识别，保留最后一次（通常是成功的那次）
      attemptMap.set(attempt.name, { attempt, index: idx })
    })
  }
  
  // 以 next_list 的顺序为基准
  if (props.node.next_list && props.node.next_list.length > 0) {
    props.node.next_list.forEach((nextItem) => {
      const attemptInfo = attemptMap.get(nextItem.name)
      if (attemptInfo) {
        // 有识别记录
        result.push({
          name: nextItem.name,
          status: attemptInfo.attempt.status,
          attemptIndex: attemptInfo.index,
          attempt: attemptInfo.attempt,
          hasNestedNodes: attemptInfo.attempt.nested_nodes && attemptInfo.attempt.nested_nodes.length > 0
        })
      } else {
        // 无识别记录
        result.push({
          name: nextItem.name,
          status: 'not-recognized'
        })
      }
    })
  } else {
    // 如果没有 next_list，直接显示所有识别尝试
    if (props.node.recognition_attempts) {
      props.node.recognition_attempts.forEach((attempt, idx) => {
        result.push({
          name: attempt.name,
          status: attempt.status,
          attemptIndex: idx,
          attempt: attempt,
          hasNestedNodes: attempt.nested_nodes && attempt.nested_nodes.length > 0
        })
      })
    }
  }
  
  return result
})

// 获取按钮类型
const getButtonType = (status: string) => {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'warning'
  return 'default'
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
      <!-- Header: 节点名称按钮 -->
      <template #header>
        <n-button
          size="small"
          @click="handleNodeClick"
        >
          {{ node.name }}
        </n-button>
      </template>

      <!-- Content: 执行流程 Recognition → Action → Next List -->
      <n-flex vertical style="gap: 12px">
        <!-- Recognition 部分（合并 next_list 和 recognition_attempts） -->
        <n-card v-if="mergedRecognitionList.length > 0" size="small" title="Recognition">
          <n-flex vertical style="gap: 8px">
            <template v-for="(item, idx) in mergedRecognitionList" :key="`merged-${idx}`">
              <!-- 未识别的节点：灰色禁用按钮 -->
              <n-button
                v-if="item.status === 'not-recognized'"
                :key="`not-recognized-${idx}`"
                size="small"
                type="default"
                ghost
                disabled
                style="align-self: flex-start; opacity: 0.5"
              >
                {{ item.name }}
              </n-button>

              <!-- 已识别的节点（没有嵌套节点）：直接显示按钮 -->
              <n-flex v-else-if="!item.hasNestedNodes" :key="`simple-${idx}`" vertical style="gap: 8px; align-items: flex-start">
                <n-button
                  size="small"
                  :type="getButtonType(item.status)"
                  ghost
                  @click="handleRecognitionClick(item.attemptIndex!)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="item.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ item.name }}
                </n-button>
                <n-image
                  v-if="item.attempt?.error_image"
                  :src="convertFileSrc(item.attempt.error_image)"
                  width="200"
                  style="border-radius: 4px"
                />
              </n-flex>

              <!-- 已识别的节点（有嵌套节点）：显示嵌套结构 -->
              <template v-else>
                <!-- 展开状态 -->
                <n-card v-if="isExpanded(item.attemptIndex!)" :key="`nested-card-${item.attemptIndex}`" size="small">
                  <template #header>
                    <n-flex align="center" style="gap: 8px">
                      <n-button
                        size="small"
                        :type="getButtonType(item.status)"
                        ghost
                        @click="handleRecognitionClick(item.attemptIndex!)"
                      >
                        <template #icon>
                          <check-circle-outlined v-if="item.status === 'success'" />
                          <close-circle-outlined v-else />
                        </template>
                        {{ item.name }}
                      </n-button>
                      <n-button size="small" @click="toggleNestedNodes(item.attemptIndex!)">
                        Hide
                      </n-button>
                    </n-flex>
                  </template>

                  <n-flex vertical style="gap: 12px">
                    <n-image
                      v-if="item.attempt?.error_image"
                      :src="convertFileSrc(item.attempt.error_image)"
                      width="200"
                      style="border-radius: 4px"
                    />
                    <n-flex wrap style="gap: 8px 12px">
                      <n-button
                        v-for="(nested, nestedIdx) in item.attempt.nested_nodes"
                        :key="`nested-${item.attemptIndex}-${nestedIdx}`"
                        size="small"
                        :type="nested.status === 'success' ? 'success' : 'warning'"
                        ghost
                        @click="handleNestedClick(item.attemptIndex!, nestedIdx)"
                      >
                        <template #icon>
                          <check-circle-outlined v-if="nested.status === 'success'" />
                          <close-circle-outlined v-else />
                        </template>
                        {{ nested.name }}
                      </n-button>
                    </n-flex>
                  </n-flex>
                </n-card>

                <!-- 折叠状态 -->
                <n-flex v-else :key="`collapsed-${idx}`" vertical style="gap: 8px; align-items: flex-start">
                  <n-flex align="center" style="gap: 8px">
                    <n-button
                      size="small"
                      :type="getButtonType(item.status)"
                      ghost
                      @click="handleRecognitionClick(item.attemptIndex!)"
                    >
                      <template #icon>
                        <check-circle-outlined v-if="item.status === 'success'" />
                        <close-circle-outlined v-else />
                      </template>
                      {{ item.name }}
                    </n-button>
                    <n-button size="small" @click="toggleNestedNodes(item.attemptIndex!)">
                      Show
                    </n-button>
                  </n-flex>
                  <n-image
                    v-if="item.attempt?.error_image"
                    :src="convertFileSrc(item.attempt.error_image)"
                    width="200"
                    style="border-radius: 4px"
                  />
                </n-flex>
              </template>
            </template>
          </n-flex>
        </n-card>

        <!-- Action 部分 -->
        <n-card v-if="node.action_details || (node.nested_action_nodes && node.nested_action_nodes.length > 0)" size="small" title="Action">
          <n-flex vertical style="gap: 8px">
            <!-- Action 按钮 -->
            <n-flex v-if="node.action_details" align="center" style="gap: 8px">
              <n-button
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
              <n-button v-if="node.nested_action_nodes && node.nested_action_nodes.length > 0" size="small" @click="actionExpanded = !actionExpanded">
                {{ actionExpanded ? 'Hide' : 'Show' }}
              </n-button>
            </n-flex>

            <!-- Custom Action 中的嵌套动作节点 -->
            <template v-if="actionExpanded && node.nested_action_nodes && node.nested_action_nodes.length > 0">
              <template v-for="(nestedActionGroup, idx) in node.nested_action_nodes" :key="`nested-action-group-${idx}`">
                <n-flex vertical style="gap: 12px">
                  <!-- 遍历子任务的每个节点 -->
                  <n-card
                    v-for="(nested, nestedIdx) in nestedActionGroup.nested_actions"
                    :key="`nested-action-${idx}-${nestedIdx}`"
                    size="small"
                  >
                    <template #header>
                      <n-flex justify="space-between" align="center">
                        <n-button
                          size="small"
                          @click="emit('select-nested-action', node, idx, nestedIdx)"
                        >
                          {{ nested.name }}
                        </n-button>
                        <n-tag size="small" :type="nested.status === 'success' ? 'success' : 'error'">
                          {{ nested.status === 'success' ? '成功' : '失败' }}
                        </n-tag>
                      </n-flex>
                    </template>

                    <!-- Recognition 部分 -->
                    <n-flex vertical style="gap: 8px">
                      <n-card v-if="nested.recognition_attempts && nested.recognition_attempts.length > 0" size="small" title="Recognition">
                        <n-flex wrap style="gap: 8px">
                          <n-button
                            v-for="(attempt, attemptIdx) in nested.recognition_attempts"
                            :key="`nested-reco-${idx}-${nestedIdx}-${attemptIdx}`"
                            size="small"
                            :type="attempt.status === 'success' ? 'success' : 'warning'"
                            ghost
                          >
                            <template #icon>
                              <check-circle-outlined v-if="attempt.status === 'success'" />
                              <close-circle-outlined v-else />
                            </template>
                            {{ attempt.name }}
                          </n-button>
                        </n-flex>
                      </n-card>

                      <!-- Action 部分 -->
                      <n-card v-if="nested.action_details" size="small" title="Action">
                        <n-button
                          size="small"
                          :type="nested.action_details.success ? 'success' : 'error'"
                          ghost
                          @click="emit('select-nested-action', node, idx, nestedIdx)"
                        >
                          <template #icon>
                            <check-circle-outlined v-if="nested.action_details.success" />
                            <close-circle-outlined v-else />
                          </template>
                          {{ nested.action_details.name }}
                        </n-button>
                      </n-card>
                    </n-flex>
                  </n-card>
                </n-flex>
              </template>
            </template>
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
