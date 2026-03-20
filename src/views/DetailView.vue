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
  selectedActionRecognitionIndex?: number | null
  selectedNestedActionRecognitionIndex?: number | null
  isActionOnlyView?: boolean
}>()

// 是否选中了嵌套动作节点
const isNestedActionSelected = computed(() => {
  return props.selectedActionIndex != null && props.selectedNestedActionIndex != null
})

// 是否选中了 Action 内识别（node.nested_recognition_in_action）
const isActionRecognitionSelected = computed(() => {
  return props.selectedActionRecognitionIndex != null
})

// 是否选中了嵌套动作中的识别尝试（nested_action.recognition_attempts）
const isNestedActionRecognitionSelected = computed(() => {
  return isNestedActionSelected.value && props.selectedNestedActionRecognitionIndex != null
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

  if (isActionRecognitionSelected.value) {
    return props.selectedNode.nested_recognition_in_action?.[props.selectedActionRecognitionIndex!] || null
  }

  // 如果选中了嵌套动作节点
  if (isNestedActionSelected.value) {
    const nestedActionGroup = props.selectedNode.nested_action_nodes?.[props.selectedActionIndex!]
    const nestedAction = nestedActionGroup?.nested_actions?.[props.selectedNestedActionIndex!]
    if (props.selectedNestedActionRecognitionIndex != null) {
      return nestedAction?.recognition_attempts?.[props.selectedNestedActionRecognitionIndex] || null
    }
    const latestAttempt = nestedAction?.recognition_attempts?.length
      ? nestedAction.recognition_attempts[nestedAction.recognition_attempts.length - 1]
      : null
    if (latestAttempt) return latestAttempt
    return nestedAction || null
  }

  if (props.selectedRecognitionIndex == null) return null

  const attempt = props.selectedNode.recognition_attempts[props.selectedRecognitionIndex]

  if (props.selectedNestedIndex != null) {
    return attempt?.nested_nodes?.[props.selectedNestedIndex] || null
  }

  return attempt || null
})

const pickStartTime = (startTimestamp?: string | null, fallbackTimestamp?: string | null, finalFallback?: string | null): string => {
  return startTimestamp || fallbackTimestamp || finalFallback || '-'
}

const toFallbackRecognition = (source: any) => {
  if (!source) return null
  const recoId = typeof source.reco_id === 'number' ? source.reco_id : Number(source.reco_id)
  return {
    reco_id: Number.isFinite(recoId) ? recoId : 0,
    algorithm: 'Unknown',
    box: null,
    detail: source.detail ?? {},
    name: source.name || '',
  }
}

const recognitionExecutionTime = computed(() => {
  const attempt = currentAttempt.value as any
  return pickStartTime(attempt?.start_timestamp, attempt?.timestamp, attempt?.end_timestamp)
})

// 当前显示的识别详情（可能是选中的识别尝试、嵌套节点，或节点的最终识别）
const currentRecognition = computed(() => {
  if (!props.selectedNode) return null

  if (isActionRecognitionSelected.value) {
    const attempt = props.selectedNode.nested_recognition_in_action?.[props.selectedActionRecognitionIndex!]
    return attempt?.reco_details || toFallbackRecognition(attempt)
  }

  // 如果选中了嵌套动作节点
  if (isNestedActionSelected.value) {
    const nestedActionGroup = props.selectedNode.nested_action_nodes?.[props.selectedActionIndex!]
    const nestedAction = nestedActionGroup?.nested_actions?.[props.selectedNestedActionIndex!]
    if (props.selectedNestedActionRecognitionIndex != null) {
      const attempt = nestedAction?.recognition_attempts?.[props.selectedNestedActionRecognitionIndex]
      return attempt?.reco_details || toFallbackRecognition(attempt)
    }
    const latestAttempt = nestedAction?.recognition_attempts?.length
      ? nestedAction.recognition_attempts[nestedAction.recognition_attempts.length - 1]
      : null
    return latestAttempt?.reco_details || nestedAction?.reco_details || toFallbackRecognition(latestAttempt || nestedAction)
  }

  // 如果选中了特定的识别尝试
  if (props.selectedRecognitionIndex != null) {
    const attempt = props.selectedNode.recognition_attempts[props.selectedRecognitionIndex]

    // 如果选中了嵌套节点，显示嵌套节点的详情
    if (props.selectedNestedIndex != null) {
      const nested = attempt?.nested_nodes?.[props.selectedNestedIndex]
      return nested?.reco_details || toFallbackRecognition(nested)
    }

    // 否则显示识别尝试的详情
    return attempt?.reco_details || toFallbackRecognition(attempt)
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
  // 显式选中识别时，不展示 Action 详情，避免“点了识别还显示动作”
  if (isActionRecognitionSelected.value || isNestedActionRecognitionSelected.value) {
    return false
  }

  // 如果选中了嵌套动作节点，检查是否有动作详情
  if (isNestedActionSelected.value) {
    const nestedActionGroup = props.selectedNode?.nested_action_nodes?.[props.selectedActionIndex!]
    const nestedAction = nestedActionGroup?.nested_actions?.[props.selectedNestedActionIndex!]
    return !!nestedAction
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
    if (!nestedAction) return null
    if (nestedAction.action_details) return nestedAction.action_details
    // 某些日志不会在 PipelineNode 细节里附带 action_details，这里给一个兜底显示
    return {
      action_id: nestedAction.node_id,
      action: 'Unknown',
      box: [0, 0, 0, 0],
      detail: {},
      name: nestedAction.name,
      success: nestedAction.status === 'success',
    }
  }

  return props.selectedNode.action_details || null
})

const actionExecutionTime = computed(() => {
  if (!props.selectedNode) return '-'
  if (isNestedActionSelected.value) {
    const nestedAction = currentNestedAction.value as any
    const actionDetails = currentActionDetails.value as any
    if (actionDetails?.start_timestamp || actionDetails?.end_timestamp) {
      return pickStartTime(actionDetails.start_timestamp, actionDetails.end_timestamp)
    }
    return pickStartTime(nestedAction?.start_timestamp, nestedAction?.timestamp, nestedAction?.end_timestamp)
  }
  const actionDetails = currentActionDetails.value as any
  if (actionDetails?.start_timestamp || actionDetails?.end_timestamp) {
    return pickStartTime(actionDetails.start_timestamp, actionDetails.end_timestamp)
  }
  const attempt = currentAttempt.value as any
  if (attempt?.start_timestamp || attempt?.end_timestamp || attempt?.timestamp) {
    return pickStartTime(attempt.start_timestamp, attempt.timestamp, attempt.end_timestamp)
  }
  return pickStartTime(props.selectedNode.start_timestamp, props.selectedNode.timestamp, props.selectedNode.end_timestamp)
})

// 是否选中了特定的识别尝试或嵌套动作节点
const isRecognitionAttemptSelected = computed(() => {
  return (
    props.selectedRecognitionIndex != null ||
    isActionRecognitionSelected.value ||
    isNestedActionSelected.value ||
    isNestedActionRecognitionSelected.value
  )
})

// 当前选中的嵌套动作节点（用于 fallback 显示）
const currentNestedAction = computed(() => {
  if (!isNestedActionSelected.value || !props.selectedNode) return null
  const group = props.selectedNode.nested_action_nodes?.[props.selectedActionIndex!]
  return group?.nested_actions?.[props.selectedNestedActionIndex!] || null
})

const nestedActionExecutionTime = computed(() => {
  const nestedAction = currentNestedAction.value as any
  return pickStartTime(nestedAction?.start_timestamp, nestedAction?.timestamp, nestedAction?.end_timestamp)
})

const nodeExecutionTime = computed(() => {
  return pickStartTime(props.selectedNode?.start_timestamp, props.selectedNode?.timestamp, props.selectedNode?.end_timestamp)
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

// 渲染结构快照（用于排查层级归属问题）
const renderStructureSnapshot = computed(() => {
  if (!props.selectedNode) return null
  const node = props.selectedNode

  return {
    node: {
      node_id: node.node_id,
      name: node.name,
      status: node.status,
      task_id: node.task_id,
      timestamp: node.timestamp,
      start_timestamp: node.start_timestamp ?? null,
      end_timestamp: node.end_timestamp ?? null,
    },
    selection: {
      selectedRecognitionIndex: props.selectedRecognitionIndex ?? null,
      selectedNestedIndex: props.selectedNestedIndex ?? null,
      selectedActionIndex: props.selectedActionIndex ?? null,
      selectedNestedActionIndex: props.selectedNestedActionIndex ?? null,
      selectedActionRecognitionIndex: props.selectedActionRecognitionIndex ?? null,
      selectedNestedActionRecognitionIndex: props.selectedNestedActionRecognitionIndex ?? null,
      isActionOnlyView: !!props.isActionOnlyView,
    },
    recognition_attempts: (node.recognition_attempts ?? []).map((attempt, index) => ({
      index,
      reco_id: attempt.reco_id,
      name: attempt.name,
      status: attempt.status,
      timestamp: attempt.timestamp,
      start_timestamp: attempt.start_timestamp ?? null,
      end_timestamp: attempt.end_timestamp ?? null,
      nested_nodes: (attempt.nested_nodes ?? []).map((nested, nestedIndex) => ({
        index: nestedIndex,
        reco_id: nested.reco_id,
        name: nested.name,
        status: nested.status,
        timestamp: nested.timestamp,
      })),
    })),
    nested_recognition_in_action: (node.nested_recognition_in_action ?? []).map((attempt, index) => ({
      index,
      reco_id: attempt.reco_id,
      name: attempt.name,
      status: attempt.status,
      timestamp: attempt.timestamp,
      start_timestamp: attempt.start_timestamp ?? null,
      end_timestamp: attempt.end_timestamp ?? null,
      nested_nodes: (attempt.nested_nodes ?? []).map((nested, nestedIndex) => ({
        index: nestedIndex,
        reco_id: nested.reco_id,
        name: nested.name,
        status: nested.status,
        timestamp: nested.timestamp,
      })),
    })),
    nested_action_nodes: (node.nested_action_nodes ?? []).map((group, groupIndex) => ({
      group_index: groupIndex,
      task_id: group.task_id,
      name: group.name,
      status: group.status,
      timestamp: group.timestamp,
      nested_actions: group.nested_actions.map((action, actionIndex) => ({
        index: actionIndex,
        node_id: action.node_id,
        name: action.name,
        status: action.status,
        timestamp: action.timestamp,
        start_timestamp: action.start_timestamp ?? null,
        end_timestamp: action.end_timestamp ?? null,
        reco_details: action.reco_details ?? null,
        action_details: action.action_details ?? null,
        recognition_attempts: (action.recognition_attempts ?? []).map((attempt, attemptIndex) => ({
          index: attemptIndex,
          reco_id: attempt.reco_id,
          name: attempt.name,
          status: attempt.status,
          timestamp: attempt.timestamp,
          start_timestamp: attempt.start_timestamp ?? null,
          end_timestamp: attempt.end_timestamp ?? null,
          reco_details: attempt.reco_details ?? null,
          nested_nodes: (attempt.nested_nodes ?? []).map((nested, nestedIndex) => ({
            index: nestedIndex,
            reco_id: nested.reco_id,
            name: nested.name,
            status: nested.status,
            timestamp: nested.timestamp,
          })),
        })),
      })),
    })),
  }
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

const copyRenderStructureSnapshot = () => {
  if (!renderStructureSnapshot.value) return
  copyToClipboard(formatJson(renderStructureSnapshot.value))
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

        <!-- 渲染结构快照 -->
        <n-card size="small" title="🧩 渲染结构快照">
          <n-flex align="center" justify="space-between" :wrap="true" style="gap: 8px">
            <n-text depth="3" style="font-size: 12px">
              reco={{ selectedNode.recognition_attempts.length }}
              · actionReco={{ selectedNode.nested_recognition_in_action?.length || 0 }}
              · nestedActionGroup={{ selectedNode.nested_action_nodes?.length || 0 }}
            </n-text>
            <n-button size="tiny" @click="copyRenderStructureSnapshot">
              <template #icon>
                <n-icon><copy-outlined /></n-icon>
              </template>
              复制结构快照
            </n-button>
          </n-flex>
        </n-card>

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
              {{ recognitionExecutionTime }}
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
              {{ actionExecutionTime }}
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
              {{ nestedActionExecutionTime }}
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
              {{ nodeExecutionTime }}
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
