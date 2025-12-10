<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NButton, NFlex, NTag, NCollapse, NCollapseItem, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo } from '../types'

const props = defineProps<{
  node: NodeInfo
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-operation': [node: NodeInfo, opIndex: number]
}>()

// 节点状态样式
const cardClass = computed(() => {
  return `node-card node-card-${props.node.status}`
})

// 状态标签类型
const statusType = computed(() => {
  return props.node.status === 'success' ? 'success' : 
         props.node.status === 'failed' ? 'error' : 'warning'
})

const statusText = computed(() => {
  return props.node.status === 'success' ? '成功' :
         props.node.status === 'failed' ? '失败' : '运行中'
})

// 合并识别和动作为操作
const operations = computed(() => {
  const recognitions = props.node.actions.filter(a => a.type === 'recognition')
  const actions = props.node.actions.filter(a => a.type === 'action')
  
  const ops = []
  // 识别和动作的配对逻辑：
  // 1. 前面的失败识别是独立的操作（没有配对动作）→ 橙色
  // 2. 最后一个成功的识别会配对一个动作 → 根据动作状态决定颜色
  // 3. 如果所有识别都失败，则都是独立操作 → 橙色
  
  let actionIndex = 0
  
  for (let i = 0; i < recognitions.length; i++) {
    const reco = recognitions[i]
    let pairedAction = null
    
    // 如果这是成功的识别，且后面还有动作，则配对
    if (reco.status === 'success' && actionIndex < actions.length) {
      pairedAction = actions[actionIndex]
      actionIndex++
    }
    
    // 确定状态
    let status = 'success'
    if (pairedAction?.status === 'failed') {
      // 动作失败 → 红色（error）
      status = 'error'
    } else if (reco.status === 'failed') {
      // 识别失败（没有配对动作）→ 橙色（warning）
      status = 'warning'
    }
    
    ops.push({
      name: formatOperationName(reco.name),
      status
    })
  }
  
  // 处理剩余的动作（理论上不应该出现）
  while (actionIndex < actions.length) {
    const action = actions[actionIndex]
    ops.push({
      name: formatOperationName(action.name),
      status: action.status === 'failed' ? 'error' : 'success'
    })
    actionIndex++
  }
  
  return ops
})

// 点击节点标题
const handleNodeClick = () => {
  emit('select-node', props.node)
}

// 点击操作按钮
const handleOperationClick = (opIndex: number) => {
  emit('select-operation', props.node, opIndex)
}

// 格式化节点标题（带前缀）
const nodeTitle = computed(() => {
  let prefix = ''
  if (props.node.jump_back) prefix += '[JumpBack]'
  if (props.node.anchor) prefix += '[Anchor]'
  const title = prefix ? `${prefix} ${props.node.name}` : props.node.name
  
  // 调试：输出有标记的节点
  if (props.node.jump_back || props.node.anchor) {
    console.log(`NodeCard 标题: ${title}, jump_back: ${props.node.jump_back}, anchor: ${props.node.anchor}`)
  }
  
  return title
})

// 格式化操作名称（从 next_list 中查找属性）
const formatOperationName = (name: string) => {
  // 先从当前节点的 next_list 中查找
  const nextItem = props.node.next_list?.find(item => item.name === name)
  if (nextItem) {
    let prefix = ''
    if (nextItem.jump_back) prefix += '[JumpBack]'
    if (nextItem.anchor) prefix += '[Anchor]'
    return prefix ? `${prefix} ${name}` : name
  }
  return name
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
  <div :class="cardClass">
    <n-card 
      size="small"
      :bordered="true"
      :content-style="{ padding: '16px' }"
    >
      <!-- 卡片头部（可点击） -->
      <template #header>
        <n-flex justify="space-between" align="center" @click="handleNodeClick" style="cursor: pointer">
          <div>
            <div style="font-size: 16px; font-weight: 500">
              {{ nodeTitle }}
            </div>
            <n-text depth="3" style="font-size: 12px; margin-top: 4px; display: block">
              🕐 {{ node.timestamp.split(' ')[1] }}
            </n-text>
          </div>
          <n-flex align="center" style="gap: 12px">
            <n-tag size="small">PipelineNode</n-tag>
            <n-tag :type="statusType" size="small">
              {{ statusText }}
            </n-tag>
          </n-flex>
        </n-flex>
      </template>

      <!-- 操作列表 -->
      <n-flex vertical style="gap: 8px">
        <n-flex wrap style="gap: 8px">
          <n-button
            v-for="(op, idx) in operations"
            :key="idx"
            size="small"
            :type="op.status as 'success' | 'error' | 'warning'"
            ghost
            @click.stop="handleOperationClick(idx)"
          >
            <template #icon>
              <check-circle-outlined v-if="op.status === 'success'" />
              <close-circle-outlined v-else-if="op.status === 'error'" />
              <close-circle-outlined v-else />
            </template>
            {{ op.name }}
          </n-button>
        </n-flex>

        <!-- Next 列表 -->
        <div v-if="node.next_list.length > 0" style="margin-top: 8px">
          <n-collapse>
            <n-collapse-item title="→ Next 列表" name="next">
              <n-flex wrap style="gap: 6px">
                <n-tag
                  v-for="(nextNode, idx) in node.next_list"
                  :key="idx"
                  size="small"
                  :type="nextNode.anchor ? 'success' : nextNode.jump_back ? 'warning' : 'info'"
                >
                  {{ formatNextName(nextNode) }}
                </n-tag>
              </n-flex>
            </n-collapse-item>
          </n-collapse>
        </div>
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

.node-card-running::before {
  background: #f2c97d;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }
  50% {
    opacity: 0.5;
    transform: translateY(-50%) scale(1.2);
  }
}

.node-card:hover {
  transform: translateX(4px);
}
</style>

