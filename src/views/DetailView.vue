<script setup lang="ts">
import { computed } from 'vue'
import {
  NCard, NFlex, NScrollbar, NDescriptions, NDescriptionsItem,
  NTag, NEmpty, NCode, NButton, NIcon, NText, NCollapse, NCollapseItem
} from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined, CopyOutlined } from '@vicons/antd'
import type { NodeInfo, TaskInfo } from '../types'

const props = defineProps<{
  selectedNode: NodeInfo | null
  selectedTask?: TaskInfo | null
  selectedRecognitionIndex?: number | null
  selectedNestedIndex?: number | null
}>()

// 节点状态标签类型
const statusType = computed(() => {
  if (!props.selectedNode) return 'default'
  return props.selectedNode.status === 'success' ? 'success' : 'error'
})

// 状态文本和图标
const statusInfo = computed(() => {
  if (!props.selectedNode) return { text: '未选择', icon: null }
  const status = props.selectedNode.status
  return {
    text: status === 'success' ? '成功' : '失败',
    icon: status === 'success' ? CheckCircleOutlined : CloseCircleOutlined
  }
})

// 当前显示的识别详情（可能是选中的识别尝试、嵌套节点，或节点的最终识别）
const currentRecognition = computed(() => {
  if (!props.selectedNode) return null

  // 如果选中了特定的识别尝试
  if (props.selectedRecognitionIndex !== null && props.selectedRecognitionIndex !== undefined) {
    const attempt = props.selectedNode.recognition_attempts[props.selectedRecognitionIndex]

    // 如果选中了嵌套节点，显示嵌套节点的详情
    if (props.selectedNestedIndex !== null && props.selectedNestedIndex !== undefined) {
      const nested = attempt?.nested_nodes?.[props.selectedNestedIndex]
      return nested?.reco_details || null
    }

    // 否则显示识别尝试的详情
    return attempt?.reco_details || null
  }

  // 否则显示节点的最终识别详情
  return props.selectedNode.reco_details || null
})

// 是否有识别详情
const hasRecognition = computed(() => {
  return !!currentRecognition.value
})

// 是否有动作详情（节点最终动作，与当前识别尝试解耦）
const hasAction = computed(() => {
  return !!props.selectedNode?.action_details
})

// 是否选中了特定的识别尝试
const isRecognitionAttemptSelected = computed(() => {
  return props.selectedRecognitionIndex !== null && props.selectedRecognitionIndex !== undefined
})

// 当前选中的识别尝试是否成功
const isCurrentRecognitionSuccess = computed(() => {
  if (!props.selectedNode || !isRecognitionAttemptSelected.value) return false

  const attempt = props.selectedNode.recognition_attempts[props.selectedRecognitionIndex!]

  // 如果选中了嵌套节点，检查嵌套节点的状态
  if (props.selectedNestedIndex !== null && props.selectedNestedIndex !== undefined) {
    const nested = attempt?.nested_nodes?.[props.selectedNestedIndex]
    return nested?.status === 'success'
  }

  // 否则检查识别尝试的状态
  return attempt?.status === 'success'
})

// 格式化 JSON
const formatJson = (obj: any) => {
  return JSON.stringify(obj, null, 2)
}

// 复制到剪贴板
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
}
</script>

<template>
  <n-scrollbar style="height: 100%">
    <div style="padding: 20px">
      <n-flex vertical style="gap: 16px">

      <!-- 未选择节点提示 -->
      <n-card v-if="!selectedNode" title="节点详情">
        <n-empty description="请点击左侧节点查看详情" />
      </n-card>

      <!-- 已选择节点 -->
      <template v-else>

        <!-- 识别详情 (仅在点击识别尝试时显示) -->
        <n-card v-if="hasRecognition && isRecognitionAttemptSelected" title="🔍 识别详情">
          <n-descriptions :column="2" size="small" label-placement="left" bordered>
            <n-descriptions-item label="识别 ID">
              {{ currentRecognition?.reco_id }}
            </n-descriptions-item>

            <n-descriptions-item label="识别算法">
              <n-tag size="small" type="info">
                {{ currentRecognition?.algorithm || 'Unknown' }}
              </n-tag>
            </n-descriptions-item>

            <n-descriptions-item label="节点名称">
              {{ currentRecognition?.name }}
            </n-descriptions-item>

            <n-descriptions-item label="识别位置" v-if="currentRecognition?.box">
              <n-text code>
                [{{ currentRecognition.box.join(', ') }}]
              </n-text>
            </n-descriptions-item>
          </n-descriptions>

          <!-- 原始识别数据 (折叠) -->
          <n-collapse style="margin-top: 16px">
            <n-collapse-item title="原始识别数据" name="reco-json">
              <template #header-extra>
                <n-button
                  size="tiny"
                  @click.stop="copyToClipboard(formatJson(currentRecognition))"
                >
                  <template #icon>
                    <n-icon><copy-outlined /></n-icon>
                  </template>
                  复制
                </n-button>
              </template>
              <n-code
                :code="formatJson(currentRecognition)"
                language="json"
                :word-wrap="true"
                style="max-height: 400px; overflow: auto; max-width: 100%"
              />
            </n-collapse-item>
          </n-collapse>
        </n-card>

        <!-- 动作详情 (仅在点击成功的识别尝试时显示) -->
        <n-card title="⚡ 动作详情" v-if="hasAction && isRecognitionAttemptSelected && isCurrentRecognitionSuccess">
          <n-descriptions :column="2" size="small" label-placement="left" bordered>
            <n-descriptions-item label="动作 ID">
              {{ selectedNode.action_details?.action_id }}
            </n-descriptions-item>

            <n-descriptions-item label="动作类型">
              <n-tag size="small" :type="selectedNode.action_details?.action === 'DoNothing' ? 'default' : 'primary'">
                {{ selectedNode.action_details?.action || 'Unknown' }}
              </n-tag>
            </n-descriptions-item>

            <n-descriptions-item label="节点名称">
              {{ selectedNode.action_details?.name }}
            </n-descriptions-item>

            <n-descriptions-item label="执行结果">
              <n-tag :type="selectedNode.action_details?.success ? 'success' : 'error'" size="small">
                {{ selectedNode.action_details?.success ? '成功' : '失败' }}
              </n-tag>
            </n-descriptions-item>

            <n-descriptions-item label="目标位置" :span="2" v-if="selectedNode.action_details?.box">
              <n-text code>
                [{{ selectedNode.action_details.box.join(', ') }}]
              </n-text>
            </n-descriptions-item>
          </n-descriptions>

          <!-- 原始动作数据 (折叠) -->
          <n-collapse style="margin-top: 16px">
            <n-collapse-item title="原始动作数据" name="action-json">
              <template #header-extra>
                <n-button
                  size="tiny"
                  @click.stop="copyToClipboard(formatJson(selectedNode.action_details))"
                >
                  <template #icon>
                    <n-icon><copy-outlined /></n-icon>
                  </template>
                  复制
                </n-button>
              </template>
              <n-code
                :code="formatJson(selectedNode.action_details)"
                language="json"
                :word-wrap="true"
                style="max-height: 400px; overflow: auto; max-width: 100%"
              />
            </n-collapse-item>
          </n-collapse>
        </n-card>

        <!-- 节点详情 (仅在点击节点名称时显示) -->
        <n-card title="📍 节点详情" v-if="!isRecognitionAttemptSelected">
          <n-descriptions :column="1" label-placement="left">
            <n-descriptions-item label="节点名称">
              <n-flex align="center" style="gap: 8px">
                <span style="font-weight: 500; font-size: 15px">
                  {{ selectedNode.name }}
                </span>
                <n-tag :type="statusType" size="small">
                  <template #icon>
                    <n-icon :component="statusInfo.icon" v-if="statusInfo.icon" />
                  </template>
                  {{ statusInfo.text }}
                </n-tag>
              </n-flex>
            </n-descriptions-item>

            <n-descriptions-item label="执行时间">
              {{ selectedNode.timestamp }}
            </n-descriptions-item>

            <n-descriptions-item label="节点 ID">
              {{ selectedNode.node_id }}
            </n-descriptions-item>

            <n-descriptions-item label="任务 ID">
              {{ selectedNode.task_id }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 节点详细信息 (仅在点击节点名称时显示) -->
        <n-card title="📋 节点详细信息" v-if="!isRecognitionAttemptSelected && selectedNode.node_details">
          <n-descriptions :column="2" size="small" label-placement="left" bordered>
            <n-descriptions-item label="节点 ID">
              {{ selectedNode.node_details.node_id }}
            </n-descriptions-item>

            <n-descriptions-item label="节点名称">
              {{ selectedNode.node_details.name }}
            </n-descriptions-item>

            <n-descriptions-item label="识别 ID">
              {{ selectedNode.node_details.reco_id }}
            </n-descriptions-item>

            <n-descriptions-item label="动作 ID">
              {{ selectedNode.node_details.action_id }}
            </n-descriptions-item>

            <n-descriptions-item label="是否完成" :span="2">
              <n-tag :type="selectedNode.node_details.completed ? 'success' : 'warning'" size="small">
                {{ selectedNode.node_details.completed ? '已完成' : '未完成' }}
              </n-tag>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 完整节点数据 (仅在点击节点名称时显示) -->
        <n-card title="📄 完整节点数据" v-if="!isRecognitionAttemptSelected">
          <n-collapse>
            <n-collapse-item title="原始 JSON 数据" name="node-json">
              <template #header-extra>
                <n-button
                  size="tiny"
                  @click.stop="copyToClipboard(formatJson(selectedNode))"
                >
                  <template #icon>
                    <n-icon><copy-outlined /></n-icon>
                  </template>
                  复制
                </n-button>
              </template>
              <n-code
                :code="formatJson(selectedNode)"
                language="json"
                :word-wrap="true"
                style="max-height: 500px; overflow: auto; max-width: 100%"
              />
            </n-collapse-item>
          </n-collapse>
        </n-card>

      </template>
      </n-flex>
    </div>
  </n-scrollbar>
</template>

<style scoped>
/* Fix Naive UI scrollbar container background in light mode */
:deep(.n-scrollbar-container) {
  background-color: transparent !important;
}

:deep(.n-scrollbar-content) {
  background-color: transparent !important;
}

:deep(.n-card__content) {
  background-color: transparent !important;
}

.n-descriptions :deep(.n-descriptions-table-wrapper) {
  background: transparent;
}
</style>
