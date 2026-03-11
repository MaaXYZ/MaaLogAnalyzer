<script setup lang="ts">
import { computed } from 'vue'
import {
  NCard, NFlex, NScrollbar, NDescriptions, NDescriptionsItem,
  NTag, NEmpty, NCode, NButton, NIcon, NText, NCollapse, NCollapseItem
} from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined, CopyOutlined } from '@vicons/antd'
import type { NodeInfo } from '../types'
import { isTauri } from '../utils/platform'
import { useIsMobile } from '../composables/useIsMobile'
import { getSettings } from '../utils/settings'

const { isMobile } = useIsMobile()
const settings = getSettings()

// 原始 JSON 折叠默认展开名称
const rawJsonDefaultExpanded = computed(() => settings.defaultExpandRawJson ? ['reco-json', 'action-json', 'node-json'] : [])

// 转换文件路径为 Tauri 可访问的 URL
const convertFileSrc = (filePath: string) => {
  if (!isTauri()) return filePath
  // Tauri v2 使用 asset 协议
  return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
}

const props = defineProps<{
  selectedNode: NodeInfo | null
  selectedRecognitionIndex?: number | null
  selectedNestedIndex?: number | null
  selectedActionIndex?: number | null
  selectedNestedActionIndex?: number | null
  isActionOnlyView?: boolean
}>()

// 是否选中了嵌套动作节点
const isNestedActionSelected = computed(() => {
  return props.selectedActionIndex != null && props.selectedNestedActionIndex != null
})

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

// 当前选中的识别尝试（用于获取时间戳等元信息）
const currentAttempt = computed(() => {
  if (!props.selectedNode) return null

  // 如果选中了嵌套动作节点
  if (isNestedActionSelected.value) {
    const nestedActionGroup = props.selectedNode.nested_action_nodes?.[props.selectedActionIndex!]
    const nestedAction = nestedActionGroup?.nested_actions?.[props.selectedNestedActionIndex!]
    return nestedAction || null
  }

  if (props.selectedRecognitionIndex == null) return null

  const attempt = props.selectedNode.recognition_attempts[props.selectedRecognitionIndex]

  if (props.selectedNestedIndex != null) {
    return attempt?.nested_nodes?.[props.selectedNestedIndex] || null
  }

  return attempt || null
})

// 当前显示的识别详情（可能是选中的识别尝试、嵌套节点，或节点的最终识别）
const currentRecognition = computed(() => {
  if (!props.selectedNode) return null

  // 如果选中了嵌套动作节点
  if (isNestedActionSelected.value) {
    const nestedActionGroup = props.selectedNode.nested_action_nodes?.[props.selectedActionIndex!]
    const nestedAction = nestedActionGroup?.nested_actions?.[props.selectedNestedActionIndex!]
    return nestedAction?.reco_details || null
  }

  // 如果选中了特定的识别尝试
  if (props.selectedRecognitionIndex != null) {
    const attempt = props.selectedNode.recognition_attempts[props.selectedRecognitionIndex]

    // 如果选中了嵌套节点，显示嵌套节点的详情
    if (props.selectedNestedIndex != null) {
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
  // 如果选中了嵌套动作节点，检查是否有动作详情
  if (isNestedActionSelected.value) {
    const nestedActionGroup = props.selectedNode?.nested_action_nodes?.[props.selectedActionIndex!]
    const nestedAction = nestedActionGroup?.nested_actions?.[props.selectedNestedActionIndex!]
    return !!nestedAction?.action_details
  }
  return !!props.selectedNode?.action_details
})

// 当前动作详情
const currentActionDetails = computed(() => {
  if (!props.selectedNode) return null

  // 如果选中了嵌套动作节点，返回嵌套动作的动作详情
  if (isNestedActionSelected.value) {
    const nestedActionGroup = props.selectedNode.nested_action_nodes?.[props.selectedActionIndex!]
    const nestedAction = nestedActionGroup?.nested_actions?.[props.selectedNestedActionIndex!]
    return nestedAction?.action_details || null
  }

  return props.selectedNode.action_details || null
})

// 是否选中了特定的识别尝试或嵌套动作节点
const isRecognitionAttemptSelected = computed(() => {
  return props.selectedRecognitionIndex != null || isNestedActionSelected.value
})

// 当前选中的嵌套动作节点（用于 fallback 显示）
const currentNestedAction = computed(() => {
  if (!isNestedActionSelected.value || !props.selectedNode) return null
  const group = props.selectedNode.nested_action_nodes?.[props.selectedActionIndex!]
  return group?.nested_actions?.[props.selectedNestedActionIndex!] || null
})

// 嵌套动作节点选中但无识别/动作详情时的 fallback
const showNestedActionFallback = computed(() => {
  return isNestedActionSelected.value && !hasRecognition.value && !hasAction.value && currentNestedAction.value != null
})

// 嵌套动作节点中带 error_image 的识别尝试
const nestedActionErrorImage = computed(() => {
  const action = currentNestedAction.value
  if (!action?.recognition_attempts) return null
  for (const attempt of action.recognition_attempts) {
    if (attempt.error_image) return attempt.error_image
  }
  return null
})

// 格式化 JSON
const formatJson = (obj: any) => {
  return JSON.stringify(obj, null, 2)
}

// 响应式列数
const descriptionColumns = computed(() => isMobile.value ? 1 : 2)

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
          <n-descriptions :column="descriptionColumns" size="small" label-placement="left" bordered>
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

            <n-descriptions-item label="执行时间">
              {{ currentAttempt?.timestamp || '-' }}
            </n-descriptions-item>

            <n-descriptions-item label="识别位置" v-if="currentRecognition?.box">
              <n-text code>
                [{{ currentRecognition.box.join(', ') }}]
              </n-text>
            </n-descriptions-item>
          </n-descriptions>

          <!-- 调试截图 (vision) -->
          <div v-if="(currentAttempt as any)?.vision_image" style="margin-top: 12px">
            <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">调试截图</n-text>
            <img :src="convertFileSrc((currentAttempt as any).vision_image)" style="max-width: 100%; border-radius: 4px" alt="调试截图" />
          </div>

          <!-- 错误截图 -->
          <div v-if="(currentAttempt as any)?.error_image" style="margin-top: 12px">
            <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">错误截图</n-text>
            <img :src="convertFileSrc((currentAttempt as any).error_image)" style="max-width: 100%; border-radius: 4px" alt="错误截图" />
          </div>

          <!-- 原始识别数据 (折叠) -->
          <n-collapse style="margin-top: 16px" :default-expanded-names="rawJsonDefaultExpanded">
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

        <!-- 动作详情 (仅在点击动作按钮或嵌套动作节点时显示) -->
        <n-card title="⚡ 动作详情" v-if="hasAction && (isActionOnlyView || (selectedActionIndex !== null && selectedNestedActionIndex !== null))">
          <n-descriptions :column="descriptionColumns" size="small" label-placement="left" bordered>
            <n-descriptions-item label="动作 ID">
              {{ currentActionDetails?.action_id }}
            </n-descriptions-item>

            <n-descriptions-item label="动作类型">
              <n-tag size="small" :type="currentActionDetails?.action === 'DoNothing' ? 'default' : 'primary'">
                {{ currentActionDetails?.action || 'Unknown' }}
              </n-tag>
            </n-descriptions-item>

            <n-descriptions-item label="节点名称">
              {{ currentActionDetails?.name }}
            </n-descriptions-item>

            <n-descriptions-item label="执行结果">
              <n-tag :type="currentActionDetails?.success ? 'success' : 'error'" size="small">
                {{ currentActionDetails?.success ? '成功' : '失败' }}
              </n-tag>
            </n-descriptions-item>

            <n-descriptions-item label="执行时间">
              {{ currentAttempt?.timestamp || '-' }}
            </n-descriptions-item>

            <n-descriptions-item label="目标位置" :span="descriptionColumns" v-if="currentActionDetails?.box">
              <n-text code>
                [{{ currentActionDetails.box.join(', ') }}]
              </n-text>
            </n-descriptions-item>
          </n-descriptions>

          <!-- wait_freezes 调试截图 -->
          <div v-if="selectedNode?.wait_freezes_images?.length && (isActionOnlyView || (selectedActionIndex !== null && selectedNestedActionIndex !== null))" style="margin-top: 12px">
            <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">Wait Freezes 截图 ({{ selectedNode.wait_freezes_images.length }})</n-text>
            <n-flex vertical style="gap: 8px">
              <img
                v-for="(img, idx) in selectedNode.wait_freezes_images"
                :key="idx"
                :src="convertFileSrc(img)"
                style="max-width: 100%; border-radius: 4px"
                :alt="`Wait Freezes 截图 ${idx + 1}`"
              />
            </n-flex>
          </div>

          <!-- 原始动作数据 (折叠) -->
          <n-collapse style="margin-top: 16px" :default-expanded-names="rawJsonDefaultExpanded">
            <n-collapse-item title="原始动作数据" name="action-json">
              <template #header-extra>
                <n-button
                  size="tiny"
                  @click.stop="copyToClipboard(formatJson(currentActionDetails))"
                >
                  <template #icon>
                    <n-icon><copy-outlined /></n-icon>
                  </template>
                  复制
                </n-button>
              </template>
              <n-code
                :code="formatJson(currentActionDetails)"
                language="json"
                :word-wrap="true"
                style="max-height: 400px; overflow: auto; max-width: 100%"
              />
            </n-collapse-item>
          </n-collapse>
        </n-card>

        <!-- 嵌套动作节点 fallback（无识别/动作详情时显示基本信息） -->
        <n-card title="📍 嵌套动作节点" v-if="showNestedActionFallback">
          <n-descriptions :column="1" label-placement="left">
            <n-descriptions-item label="节点名称">
              <n-flex align="center" style="gap: 8px">
                <span style="font-weight: 500; font-size: 15px">
                  {{ currentNestedAction!.name }}
                </span>
                <n-tag :type="currentNestedAction!.status === 'success' ? 'success' : 'error'" size="small">
                  {{ currentNestedAction!.status === 'success' ? '成功' : '失败' }}
                </n-tag>
              </n-flex>
            </n-descriptions-item>

            <n-descriptions-item label="执行时间">
              {{ currentNestedAction!.timestamp }}
            </n-descriptions-item>

            <n-descriptions-item label="节点 ID">
              {{ currentNestedAction!.node_id }}
            </n-descriptions-item>

            <n-descriptions-item label="识别尝试">
              {{ currentNestedAction!.recognition_attempts?.length || 0 }} 次
            </n-descriptions-item>

            <n-descriptions-item label="错误截图" v-if="nestedActionErrorImage" :span="2">
              <img :src="convertFileSrc(nestedActionErrorImage)" style="max-width: 100%; border-radius: 4px; margin-top: 8px" alt="错误截图" />
            </n-descriptions-item>
          </n-descriptions>

          <!-- 原始数据 -->
          <n-collapse style="margin-top: 16px" :default-expanded-names="rawJsonDefaultExpanded">
            <n-collapse-item title="原始 JSON 数据" name="node-json">
              <template #header-extra>
                <n-button
                  size="tiny"
                  @click.stop="copyToClipboard(formatJson(currentNestedAction))"
                >
                  <template #icon>
                    <n-icon><copy-outlined /></n-icon>
                  </template>
                  复制
                </n-button>
              </template>
              <n-code
                :code="formatJson(currentNestedAction)"
                language="json"
                :word-wrap="true"
                style="max-height: 500px; overflow: auto; max-width: 100%"
              />
            </n-collapse-item>
          </n-collapse>
        </n-card>

        <!-- 节点详情 (仅在点击节点名称时显示) -->
        <n-card title="📍 节点详情" v-if="!isRecognitionAttemptSelected && !isActionOnlyView">
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

            <n-descriptions-item label="节点截图" v-if="selectedNode.error_image" :span="2">
              <img :src="convertFileSrc(selectedNode.error_image)" style="max-width: 100%; border-radius: 4px; margin-top: 8px" alt="节点截图" />
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 节点详细信息 (仅在点击节点名称时显示) -->
        <n-card title="📋 节点详细信息" v-if="!isRecognitionAttemptSelected && !isActionOnlyView && selectedNode.node_details">
          <n-descriptions :column="descriptionColumns" size="small" label-placement="left" bordered>
            <n-descriptions-item label="节点 ID">
              {{ selectedNode.node_details.node_id }}
            </n-descriptions-item>

            <n-descriptions-item label="识别 ID">
              {{ selectedNode.node_details.reco_id }}
            </n-descriptions-item>

            <n-descriptions-item label="动作 ID">
              {{ selectedNode.node_details.action_id }}
            </n-descriptions-item>

            <n-descriptions-item label="是否完成">
              <n-tag :type="selectedNode.node_details.completed ? 'success' : 'warning'" size="small">
                {{ selectedNode.node_details.completed ? '已完成' : '未完成' }}
              </n-tag>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 完整节点数据 (仅在点击节点名称时显示) -->
        <n-card title="📄 完整节点数据" v-if="!isRecognitionAttemptSelected && !isActionOnlyView">
          <n-collapse :default-expanded-names="rawJsonDefaultExpanded">
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

@media (max-width: 768px) {
  :deep(.n-descriptions-table-wrapper) {
    font-size: 13px;
  }
}
</style>
