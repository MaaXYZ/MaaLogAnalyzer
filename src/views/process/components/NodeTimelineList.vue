<script setup lang="ts">
import { NEmpty } from 'naive-ui'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { NodeInfo } from '../../../types'
import NodeCard from '../../../components/NodeCard.vue'

type NodeTimelineItem = NodeInfo & {
  _uniqueKey: string
}

const props = withDefaults(defineProps<{
  nodes: NodeTimelineItem[]
  selectedTaskKey?: string | null
  displayMode: string
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
  itemPadding?: string
  scrollerStyle?: string
  wrapperStyle?: string
  captureWheelUp?: boolean
}>(), {
  selectedTaskKey: null,
  isVscodeLaunchEmbed: false,
  bridgeRequestTaskDoc: null,
  bridgeRevealTask: null,
  itemPadding: '12px',
  scrollerStyle: 'height: 100%',
  wrapperStyle: 'height: 100%; display: flex; flex-direction: column; position: relative',
  captureWheelUp: false,
})

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'manual-scroll-up': []
  'scroller-mounted': [scroller: InstanceType<typeof DynamicScroller> | null]
}>()

const setDynamicScrollerRef = (value: Element | object | null) => {
  emit('scroller-mounted', value as InstanceType<typeof DynamicScroller> | null)
}

const handleWheel = (event: WheelEvent) => {
  if (!props.captureWheelUp) return
  if (event.deltaY < 0) {
    emit('manual-scroll-up')
  }
}
</script>

<template>
  <div :style="wrapperStyle" @wheel.passive="handleWheel">
    <div v-if="nodes.length === 0" style="padding: 40px 0">
      <n-empty description="暂无节点数据" />
    </div>
    <DynamicScroller
      v-else
      :ref="setDynamicScrollerRef"
      :key="selectedTaskKey ?? undefined"
      :items="nodes"
      :min-item-size="150"
      key-field="_uniqueKey"
      class="virtual-scroller"
      :style="scrollerStyle"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :data-index="index"
          :size-dependencies="[
            item.node_flow?.length,
            item.next_list?.length,
            item.action_details,
            displayMode,
          ]"
        >
          <div :style="{ padding: itemPadding }">
            <node-card
              :node="item"
              :is-vscode-launch-embed="isVscodeLaunchEmbed"
              :bridge-request-task-doc="bridgeRequestTaskDoc"
              :bridge-reveal-task="bridgeRevealTask"
              @select-node="(node) => emit('select-node', node)"
              @select-action="(node) => emit('select-action', node)"
              @select-recognition="(node, attemptIndex) => emit('select-recognition', node, attemptIndex)"
              @select-flow-item="(node, flowItemId) => emit('select-flow-item', node, flowItemId)"
            />
          </div>
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
  </div>
</template>
