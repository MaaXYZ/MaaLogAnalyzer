<script setup lang="ts">
import { computed } from 'vue'
import {
  NCard, NFlex, NScrollbar, NDescriptions, NDescriptionsItem,
  NTag, NEmpty, NCollapse, NCollapseItem, NCode, NButton, NIcon, NText
} from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined, CopyOutlined } from '@vicons/antd'
import type { NodeInfo, TaskInfo } from '../types'

const props = defineProps<{
  selectedNode: NodeInfo | null
  selectedTask?: TaskInfo | null
  selectedOperationIndex?: number | null
}>()

// 是否选中了具体操作
const isOperationSelected = computed(() => {
  return props.selectedOperationIndex !== null && props.selectedOperationIndex !== undefined
})

// 选中的操作
const selectedOperation = computed(() => {
  if (!isOperationSelected.value || !props.selectedNode) return null
  return operations.value[props.selectedOperationIndex!]
})

// 节点状态标签类型
const statusType = computed(() => {
  if (!props.selectedNode) return 'default'
  return props.selectedNode.status === 'success' ? 'success' : 
         props.selectedNode.status === 'failed' ? 'error' : 'warning'
})

// 状态文本和图标
const statusInfo = computed(() => {
  if (!props.selectedNode) return { text: '未选择', icon: null }
  const status = props.selectedNode.status
  return {
    text: status === 'success' ? '成功' : status === 'failed' ? '失败' : '运行中',
    icon: status === 'success' ? CheckCircleOutlined : 
          status === 'failed' ? CloseCircleOutlined : null
  }
})

// 合并识别和动作为操作步骤
const operations = computed(() => {
  if (!props.selectedNode) return []
  
  const ops: Array<{
    index: number
    recognition: any
    action: any
    recognitionDetail?: any
    actionDetail?: any
  }> = []
  
  const recognitions = props.selectedNode.actions.filter(a => a.type === 'recognition')
  const actions = props.selectedNode.actions.filter(a => a.type === 'action')
  
  // 识别和动作的配对逻辑：
  // 1. 前面的失败识别是独立的操作（没有配对动作）
  // 2. 最后一个成功的识别会配对一个动作
  // 3. 如果所有识别都失败，则都是独立操作
  
  let actionIndex = 0
  
  for (let i = 0; i < recognitions.length; i++) {
    const reco = recognitions[i]
    let pairedAction = null
    let pairedActionDetail = null
    
    // 如果这是成功的识别，且后面还有动作，则配对
    if (reco.status === 'success' && actionIndex < actions.length) {
      pairedAction = actions[actionIndex]
      pairedActionDetail = props.selectedNode.actionDetails?.[actionIndex]
      actionIndex++
    }
    
    ops.push({
      index: i + 1,
      recognition: reco,
      action: pairedAction,
      recognitionDetail: props.selectedNode.recognitionDetails?.[i],
      actionDetail: pairedActionDetail
    })
  }
  
  // 处理剩余的动作（如果有，理论上不应该出现）
  while (actionIndex < actions.length) {
    ops.push({
      index: ops.length + 1,
      recognition: null,
      action: actions[actionIndex],
      recognitionDetail: undefined,
      actionDetail: props.selectedNode.actionDetails?.[actionIndex]
    })
    actionIndex++
  }
  
  return ops
})

// 当前操作相关的日志条目
const relevantLogEntries = computed(() => {
  if (!props.selectedNode) return []
  
  // 如果选择了具体的操作，只显示这个操作相关的日志
  if (isOperationSelected.value && selectedOperation.value) {
    const entries: any[] = []
    const op = selectedOperation.value
    
    // 添加识别相关的日志
    if (op.recognition) {
      const recoId = op.recognition.reco_id
      entries.push(...props.selectedNode.entries.filter((e: any) => 
        e.details?.reco_id === recoId || 
        (e.message.includes('Recognition') && e.details?.name === op.recognition.name)
      ))
    }
    
    // 添加动作相关的日志
    if (op.action) {
      const actionId = op.action.action_id
      entries.push(...props.selectedNode.entries.filter((e: any) => 
        e.details?.action_id === actionId || 
        (e.message.includes('Action') && e.details?.name === op.action.name)
      ))
    }
    
    // 去重并按时间排序
    const uniqueEntries = Array.from(new Set(entries))
    return uniqueEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }
  
  // 否则显示整个节点的所有日志
  return props.selectedNode.entries
})

// 格式化 JSON
const formatJson = (obj: any) => {
  return JSON.stringify(obj, null, 2)
}

// 复制到剪贴板
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  console.log('已复制到剪贴板')
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
            
            <n-descriptions-item label="节点 ID" v-if="selectedNode.node_id">
              {{ selectedNode.node_id }}
            </n-descriptions-item>
            
            <n-descriptions-item label="操作次数">
              {{ operations.length }} 次
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 节点概览（点击节点标题时）-->
        <n-card title="📋 节点概览" v-if="!isOperationSelected && operations.length > 0">
          <n-text depth="3">
            此节点包含 {{ operations.length }} 个操作，请点击左侧操作按钮查看详情
          </n-text>
        </n-card>

        <!-- 操作详情（点击操作按钮时）-->
        <n-card title="🎯 操作详情" v-if="isOperationSelected && selectedOperation">
          <n-flex vertical style="gap: 16px">
            <n-card size="small" embedded>
              
              <!-- 操作标题 -->
              <n-flex justify="space-between" align="center" style="margin-bottom: 12px">
                <n-text style="font-weight: 600; font-size: 15px">
                  操作 #{{ selectedOperation.index }}
                </n-text>
                <n-flex style="gap: 8px">
                  <n-tag v-if="selectedOperation.recognition" :type="selectedOperation.recognition.status === 'success' ? 'success' : 'error'" size="small">
                    🔍 识别{{ selectedOperation.recognition.status === 'success' ? '成功' : '失败' }}
                  </n-tag>
                  <n-tag v-if="selectedOperation.action" :type="selectedOperation.action.status === 'success' ? 'success' : 'error'" size="small">
                    ⚡ 动作{{ selectedOperation.action.status === 'success' ? '成功' : '失败' }}
                  </n-tag>
                </n-flex>
              </n-flex>

              <!-- 识别部分 -->
              <div v-if="selectedOperation.recognition" style="margin-bottom: 12px">
                <n-text strong style="display: block; margin-bottom: 8px; color: #666">
                  🔍 识别阶段
                </n-text>
                <n-descriptions :column="2" size="small" label-placement="left" bordered>
                  <n-descriptions-item label="识别名称">
                    {{ selectedOperation.recognition.name }}
                  </n-descriptions-item>
                  <n-descriptions-item label="识别 ID" v-if="selectedOperation.recognition.reco_id">
                    {{ selectedOperation.recognition.reco_id }}
                  </n-descriptions-item>
                  
                  <!-- 增强的识别详情 -->
                  <template v-if="selectedOperation.recognitionDetail">
                    <n-descriptions-item label="识别算法">
                      <n-tag size="small" type="info">
                        {{ selectedOperation.recognitionDetail.algorithm || 'Unknown' }}
                      </n-tag>
                    </n-descriptions-item>
                    
                    <n-descriptions-item label="识别得分" v-if="selectedOperation.recognitionDetail.score !== undefined">
                      <n-text :type="selectedOperation.recognitionDetail.score >= 0.9 ? 'success' : 'warning'">
                        {{ selectedOperation.recognitionDetail.score.toFixed(4) }}
                      </n-text>
                    </n-descriptions-item>
                    
                    <n-descriptions-item label="识别位置" v-if="selectedOperation.recognitionDetail.box" :span="2">
                      <n-text code>
                        [{{ selectedOperation.recognitionDetail.box.join(', ') }}]
                      </n-text>
                    </n-descriptions-item>
                    
                    <n-descriptions-item label="OCR 文本" v-if="selectedOperation.recognitionDetail.text" :span="2">
                      <n-text strong style="color: #18a058; font-size: 14px">
                        {{ selectedOperation.recognitionDetail.text }}
                      </n-text>
                    </n-descriptions-item>
                  </template>
                </n-descriptions>
              </div>

              <!-- 动作部分 -->
              <div v-if="selectedOperation.action">
                <n-text strong style="display: block; margin-bottom: 8px; color: #666">
                  ⚡ 动作阶段
                </n-text>
                <n-descriptions :column="2" size="small" label-placement="left" bordered>
                  <n-descriptions-item label="动作名称">
                    {{ selectedOperation.action.name }}
                  </n-descriptions-item>
                  <n-descriptions-item label="动作 ID" v-if="selectedOperation.action.action_id">
                    {{ selectedOperation.action.action_id }}
                  </n-descriptions-item>
                  
                  <!-- 增强的动作详情 -->
                  <template v-if="selectedOperation.actionDetail">
                    <n-descriptions-item label="动作类型">
                      <n-tag size="small" :type="selectedOperation.actionDetail.action_type === 'DoNothing' ? 'default' : 'primary'">
                        {{ selectedOperation.actionDetail.action_type || 'Unknown' }}
                      </n-tag>
                    </n-descriptions-item>
                    
                    <n-descriptions-item label="目标位置" v-if="selectedOperation.actionDetail.target_box">
                      <n-text code>
                        [{{ selectedOperation.actionDetail.target_box.join(', ') }}]
                      </n-text>
                    </n-descriptions-item>
                    
                    <n-descriptions-item label="执行结果" v-if="selectedOperation.actionDetail.raw_detail?.result" :span="2">
                      <n-code
                        :code="formatJson(selectedOperation.actionDetail.raw_detail.result)"
                        language="json"
                        style="max-height: 150px; overflow: auto"
                      />
                    </n-descriptions-item>
                  </template>
                </n-descriptions>
              </div>

            </n-card>
          </n-flex>
        </n-card>

        <!-- Next 列表 -->
        <n-card title="→ Next 列表" v-if="selectedNode.next_list.length > 0">
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

        <!-- 原始日志 -->
        <n-card :title="isOperationSelected ? '📄 操作日志' : '📄 节点日志'">
          <n-collapse>
            <n-collapse-item :title="`查看原始 JSON 数据 (${relevantLogEntries.length} 条)`" name="json">
              <n-flex vertical style="gap: 12px">
                <div v-for="(entry, idx) in relevantLogEntries" :key="idx">
                  <n-flex justify="space-between" align="center" style="margin-bottom: 8px">
                    <n-text strong>{{ entry.message }}</n-text>
                    <n-button
                      size="tiny"
                      @click="copyToClipboard(formatJson(entry))"
                    >
                      <template #icon>
                        <n-icon><copy-outlined /></n-icon>
                      </template>
                      复制
                    </n-button>
                  </n-flex>
                  <n-code
                    :code="formatJson(entry)"
                    language="json"
                    style="max-height: 300px; overflow: auto"
                  />
                </div>
              </n-flex>
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