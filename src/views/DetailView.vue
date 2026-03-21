<script setup lang="ts">
import { computed } from 'vue'
import {
  NCard, NFlex, NScrollbar, NDescriptions, NDescriptionsItem,
  NTag, NEmpty, NCode, NButton, NIcon, NText, NCollapse, NCollapseItem
} from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined, CopyOutlined } from '@vicons/antd'
import type { NodeInfo, UnifiedFlowItem } from '../types'
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
  selectedFlowItemId?: string | null
}>()

const flattenFlowItems = (items: UnifiedFlowItem[] | undefined, output: UnifiedFlowItem[] = []): UnifiedFlowItem[] => {
  if (!items || items.length === 0) return output
  for (const item of items) {
    output.push(item)
    if (item.children && item.children.length > 0) {
      flattenFlowItems(item.children, output)
    }
  }
  return output
}

const pickFirstErrorImage = (items: UnifiedFlowItem[] | undefined): string | null => {
  const flattened = flattenFlowItems(items)
  for (const item of flattened) {
    if (item.type !== 'recognition') continue
    const candidate = item.error_image
    if (candidate) return candidate
  }
  return null
}

const selectedFlowItem = computed<UnifiedFlowItem | null>(() => {
  if (!props.selectedNode || !props.selectedFlowItemId) return null
  const flattened = flattenFlowItems(props.selectedNode.flow_items)
  return flattened.find(item => item.id === props.selectedFlowItemId) || null
})

const isFlowItemSelected = computed(() => !!selectedFlowItem.value)

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

const currentRecognitionItem = computed<UnifiedFlowItem | null>(() => {
  const selected = selectedFlowItem.value
  if (!selected) return null
  if (selected.type === 'recognition') return selected
  return null
})

const currentAttempt = computed(() => currentRecognitionItem.value)

const recognitionExecutionTime = computed(() => {
  const recognition = currentRecognitionItem.value as any
  return pickStartTime(recognition?.start_timestamp, recognition?.timestamp, recognition?.end_timestamp)
})

// 当前显示的识别详情（可能是选中的识别尝试、嵌套节点，或节点的最终识别）
const currentRecognition = computed(() => {
  const recognition = currentRecognitionItem.value
  if (!recognition) return null
  return recognition.reco_details || toFallbackRecognition(recognition)
})

// 是否有识别详情
const hasRecognition = computed(() => {
  return isFlowItemSelected.value && !!currentRecognition.value
})

const currentActionItem = computed<UnifiedFlowItem | null>(() => {
  const selected = selectedFlowItem.value
  if (!selected || selected.type !== 'action') return null
  return selected
})

// 当前动作详情
const currentActionDetails = computed(() => {
  const action = currentActionItem.value
  if (!action) return null
  if (action.action_details) return action.action_details
  return {
    action_id: action.action_id || action.node_id || 0,
    action: 'Unknown',
    box: [0, 0, 0, 0] as [number, number, number, number],
    detail: {},
    name: action.name,
    success: action.status === 'success',
    start_timestamp: action.start_timestamp,
    end_timestamp: action.end_timestamp,
  }
})

const hasAction = computed(() => !!currentActionDetails.value)

const actionExecutionTime = computed(() => {
  const actionItem = currentActionItem.value as any
  const actionDetails = currentActionDetails.value as any
  if (actionDetails?.start_timestamp || actionDetails?.end_timestamp) {
    return pickStartTime(actionDetails.start_timestamp, actionDetails.end_timestamp)
  }
  return pickStartTime(actionItem?.start_timestamp, actionItem?.timestamp, actionItem?.end_timestamp)
})

const selectedFlowExecutionTime = computed(() => {
  const selected = selectedFlowItem.value as any
  return pickStartTime(selected?.start_timestamp, selected?.timestamp, selected?.end_timestamp)
})

const nodeExecutionTime = computed(() => {
  return pickStartTime(props.selectedNode?.start_timestamp, props.selectedNode?.timestamp, props.selectedNode?.end_timestamp)
})

const showTaskFallback = computed(() => {
  return selectedFlowItem.value?.type === 'task' && !hasRecognition.value && !hasAction.value
})

const showNodeCompletedRow = computed(() => {
  const node = props.selectedNode
  const details = node?.node_details
  if (!node || !details) return false
  // 当节点已明确标记为 failed 且 completed=false 时，语义重复，隐藏“是否完成”行。
  if (node.status === 'failed' && !details.completed) return false
  return true
})

const nodeCompletedValue = computed(() => props.selectedNode?.node_details?.completed ?? false)

const selectedFlowErrorImage = computed(() => {
  const selected = selectedFlowItem.value
  if (!selected) return null
  const own = selected.error_image
  if (own) return own
  return pickFirstErrorImage(selected.children)
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

        <!-- 识别详情 -->
        <n-card v-if="hasRecognition" title="🔍 识别详情">
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

        <!-- 动作详情 -->
        <n-card title="⚡ 动作详情" v-if="hasAction">
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
          <div v-if="selectedNode?.wait_freezes_images?.length && hasAction" style="margin-top: 12px">
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

        <!-- Task fallback（无识别/动作详情时显示基本信息） -->
        <n-card title="🧩 任务详情" v-if="showTaskFallback && selectedFlowItem">
          <n-descriptions :column="descriptionColumns" size="small" label-placement="left" bordered>
            <n-descriptions-item label="任务名称" :span="descriptionColumns">
              <n-flex align="center" style="gap: 8px">
                <span style="font-weight: 500; font-size: 15px">
                  {{ selectedFlowItem.name }}
                </span>
                <n-tag :type="selectedFlowItem.status === 'success' ? 'success' : 'error'" size="small">
                  {{ selectedFlowItem.status === 'success' ? '成功' : '失败' }}
                </n-tag>
              </n-flex>
            </n-descriptions-item>

            <n-descriptions-item label="执行时间">
              {{ selectedFlowExecutionTime }}
            </n-descriptions-item>

            <n-descriptions-item label="Task ID">
              {{ selectedFlowItem.task_id ?? '-' }}
            </n-descriptions-item>

            <n-descriptions-item label="节点 ID">
              {{ selectedFlowItem.node_id ?? '-' }}
            </n-descriptions-item>

            <n-descriptions-item label="子项数量">
              {{ selectedFlowItem.children?.length || 0 }}
            </n-descriptions-item>

            <n-descriptions-item label="错误截图" v-if="selectedFlowErrorImage" :span="descriptionColumns">
              <img :src="convertFileSrc(selectedFlowErrorImage)" style="max-width: 100%; border-radius: 4px; margin-top: 8px" alt="错误截图" />
            </n-descriptions-item>
          </n-descriptions>

          <!-- 原始数据 -->
          <n-collapse style="margin-top: 16px" :default-expanded-names="rawJsonDefaultExpanded">
            <n-collapse-item title="原始任务数据" name="task-json">
              <template #header-extra>
                <n-button
                  size="tiny"
                  @click.stop="copyToClipboard(formatJson(selectedFlowItem))"
                >
                  <template #icon>
                    <n-icon><copy-outlined /></n-icon>
                  </template>
                  复制
                </n-button>
              </template>
              <n-code
                :code="formatJson(selectedFlowItem)"
                language="json"
                :word-wrap="true"
                style="max-height: 500px; overflow: auto; max-width: 100%"
              />
            </n-collapse-item>
          </n-collapse>
        </n-card>

        <!-- 节点详情 (仅在点击节点名称时显示) -->
        <n-card title="📍 节点详情" v-if="!isFlowItemSelected">
          <n-descriptions :column="descriptionColumns" size="small" label-placement="left" bordered>
            <n-descriptions-item label="节点名称" :span="descriptionColumns">
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

            <n-descriptions-item
              label="识别 ID"
              v-if="selectedNode.node_details && selectedNode.node_details.reco_id != null"
            >
              {{ selectedNode.node_details.reco_id }}
            </n-descriptions-item>

            <n-descriptions-item
              label="动作 ID"
              v-if="selectedNode.node_details && selectedNode.node_details.action_id != null"
            >
              {{ selectedNode.node_details.action_id }}
            </n-descriptions-item>

            <n-descriptions-item label="是否完成" v-if="showNodeCompletedRow">
              <n-tag :type="nodeCompletedValue ? 'success' : 'warning'" size="small">
                {{ nodeCompletedValue ? '已完成' : '未完成' }}
              </n-tag>
            </n-descriptions-item>

            <n-descriptions-item label="节点截图" v-if="selectedNode.error_image" :span="descriptionColumns">
              <img :src="convertFileSrc(selectedNode.error_image)" style="max-width: 100%; border-radius: 4px; margin-top: 8px" alt="节点截图" />
            </n-descriptions-item>
          </n-descriptions>

          <n-collapse style="margin-top: 16px" :default-expanded-names="rawJsonDefaultExpanded">
            <n-collapse-item title="原始节点数据" name="node-json">
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
