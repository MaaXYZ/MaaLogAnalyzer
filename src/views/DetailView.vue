<script setup lang="ts">
import { computed } from 'vue'
import {
  NCard, NFlex, NScrollbar, NDescriptions, NDescriptionsItem,
  NTag, NEmpty, NCode, NButton, NIcon, NText
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

// 是否有动作详情
const hasAction = computed(() => {
  if (!props.selectedNode?.action_details) return false

  // 如果选中了特定的识别尝试
  if (props.selectedRecognitionIndex !== null && props.selectedRecognitionIndex !== undefined) {
    const attempt = props.selectedNode.recognition_attempts[props.selectedRecognitionIndex]
    // 只有识别成功的尝试才显示动作详情
    return attempt?.status === 'success'
  }

  // 未选中特定识别尝试时，显示节点的动作详情
  return true
})

// 是否选中了特定的识别尝试
const isRecognitionAttemptSelected = computed(() => {
  return props.selectedRecognitionIndex !== null && props.selectedRecognitionIndex !== undefined
})

// 格式化 JSON
const formatJson = (obj: any) => {
  return JSON.stringify(obj, null, 2)
}

// 复制到剪贴板
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
}

// 格式化 Next 列表项名称
const formatNextName = (item: any) => {
  let prefix = ''
  if (item.jump_back) prefix += '[JumpBack]'
  if (item.anchor) prefix += '[Anchor]'
  return prefix ? `${prefix} ${item.name}` : item.name
}
</script>

<template>
  <n-scrollbar style="height: 100%">
    <div style="padding: 20px">
      <n-flex vertical style="gap: 16px">

      <!-- 任务信息（始终显示，如果有选中的任务） -->
      <n-card title="📋 当前任务" v-if="selectedTask">
        <n-descriptions :column="2" label-placement="left" size="small">
          <n-descriptions-item label="任务入口">
            <n-text strong>{{ selectedTask.entry }}</n-text>
          </n-descriptions-item>
          <n-descriptions-item label="任务状态">
            <n-tag :type="selectedTask.status === 'succeeded' ? 'success' : selectedTask.status === 'failed' ? 'error' : 'warning'" size="small">
              {{ selectedTask.status === 'succeeded' ? '成功' : selectedTask.status === 'failed' ? '失败' : '运行中' }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="任务 ID">
            {{ selectedTask.task_id }}
          </n-descriptions-item>
          <n-descriptions-item label="开始时间">
            {{ selectedTask.start_time }}
          </n-descriptions-item>
          <n-descriptions-item label="结束时间" v-if="selectedTask.end_time">
            {{ selectedTask.end_time }}
          </n-descriptions-item>
          <n-descriptions-item label="持续时间" v-if="selectedTask.duration">
            {{ (selectedTask.duration / 1000).toFixed(2) }}s
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <!-- 未选择节点提示 -->
      <n-card v-if="!selectedNode" title="节点详情">
        <n-empty description="请点击左侧节点查看详情" />
      </n-card>

      <!-- 已选择节点 -->
      <template v-else>

        <!-- 节点基本信息 -->
        <n-card title="📍 节点详情">
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

        <!-- 识别详情 -->
        <n-card v-if="hasRecognition">
          <template #header>
            <n-flex align="center" style="gap: 8px">
              <span>🔍 识别详情</span>
              <n-tag v-if="isRecognitionAttemptSelected" size="small" type="warning">
                识别尝试 #{{ selectedRecognitionIndex! + 1 }}
              </n-tag>
            </n-flex>
          </template>

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

          <!-- 原始识别数据 -->
          <div style="margin-top: 16px">
            <n-flex justify="space-between" align="center" style="margin-bottom: 8px">
              <n-text strong>原始识别数据</n-text>
              <n-button
                size="tiny"
                @click="copyToClipboard(formatJson(currentRecognition))"
              >
                <template #icon>
                  <n-icon><copy-outlined /></n-icon>
                </template>
                复制
              </n-button>
            </n-flex>
            <n-code
              :code="formatJson(currentRecognition)"
              language="json"
              :word-wrap="true"
              style="max-height: 400px; overflow: auto; max-width: 100%"
            />
          </div>
        </n-card>

        <!-- 动作详情 -->
        <n-card title="⚡ 动作详情" v-if="hasAction">
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

            <n-descriptions-item label="目标位置" :span="2">
              <n-text code>
                [{{ selectedNode.action_details?.box.join(', ') }}]
              </n-text>
            </n-descriptions-item>
          </n-descriptions>

          <!-- 原始动作数据 -->
          <div style="margin-top: 16px">
            <n-flex justify="space-between" align="center" style="margin-bottom: 8px">
              <n-text strong>原始动作数据</n-text>
              <n-button
                size="tiny"
                @click="copyToClipboard(formatJson(selectedNode.action_details))"
              >
                <template #icon>
                  <n-icon><copy-outlined /></n-icon>
                </template>
                复制
              </n-button>
            </n-flex>
            <n-code
              :code="formatJson(selectedNode.action_details)"
              language="json"
              :word-wrap="true"
              style="max-height: 400px; overflow: auto; max-width: 100%"
            />
          </div>
        </n-card>

        <!-- Next 列表 -->
        <n-card title="→ Next 列表" v-if="selectedNode.next_list && selectedNode.next_list.length > 0">
          <n-flex wrap style="gap: 8px">
            <n-tag
              v-for="(next, idx) in selectedNode.next_list"
              :key="idx"
              :type="next.anchor ? 'success' : next.jump_back ? 'warning' : 'info'"
              size="medium"
            >
              {{ formatNextName(next) }}
            </n-tag>
          </n-flex>
          <n-text depth="3" style="margin-top: 12px; display: block; font-size: 12px">
            共 {{ selectedNode.next_list.length }} 个候选节点
          </n-text>
        </n-card>

        <!-- 节点详细信息 -->
        <n-card title="📋 节点详细信息" v-if="selectedNode.node_details">
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

        <!-- 完整节点数据 -->
        <n-card title="📄 完整节点数据">
          <n-flex justify="space-between" align="center" style="margin-bottom: 8px">
            <n-text strong>原始 JSON 数据</n-text>
            <n-button
              size="tiny"
              @click="copyToClipboard(formatJson(selectedNode))"
            >
              <template #icon>
                <n-icon><copy-outlined /></n-icon>
              </template>
              复制
            </n-button>
          </n-flex>
          <n-code
            :code="formatJson(selectedNode)"
            language="json"
            :word-wrap="true"
            style="max-height: 500px; overflow: auto; max-width: 100%"
          />
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
