<script setup lang="ts">
import NodeTimelineList from './NodeTimelineList.vue'
import type { NodeInfo } from '../../../types'
import type { DynamicScroller } from 'vue-virtual-scroller'

type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

const props = withDefaults(defineProps<{
  currentNodes: NodeTimelineItem[]
  selectedTaskKey?: string | null
  displayMode: string
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
  itemPadding?: string
  scrollerStyle?: string
  wrapperStyle?: string
  captureWheelUp?: boolean
  selectedNodeId?: number | null
  safeScrollToItem?: (index: number) => Promise<boolean>
}>(), {
  selectedTaskKey: null,
  isVscodeLaunchEmbed: false,
  bridgeRequestTaskDoc: null,
  bridgeRevealTask: null,
  itemPadding: '12px',
  scrollerStyle: 'height: 100%',
  wrapperStyle: 'height: 100%; display: flex; flex-direction: column; position: relative',
  captureWheelUp: true,
  selectedNodeId: null,
  safeScrollToItem: undefined,
})

const emit = defineEmits<{
  'scroller-mounted': [scroller: InstanceType<typeof DynamicScroller> | null]
  'manual-scroll-up': []
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
}>()
</script>

<template>
  <node-timeline-list
    :nodes="props.currentNodes"
    :selected-task-key="props.selectedTaskKey"
    :display-mode="props.displayMode"
    :is-vscode-launch-embed="props.isVscodeLaunchEmbed"
    :bridge-request-task-doc="props.bridgeRequestTaskDoc"
    :bridge-reveal-task="props.bridgeRevealTask"
    :item-padding="props.itemPadding"
    :scroller-style="props.scrollerStyle"
    :wrapper-style="props.wrapperStyle"
    :capture-wheel-up="props.captureWheelUp"
    :selected-node-id="props.selectedNodeId ?? null"
    :safe-scroll-to-item="props.safeScrollToItem"
    @scroller-mounted="emit('scroller-mounted', $event)"
    @manual-scroll-up="emit('manual-scroll-up')"
    @select-node="emit('select-node', $event)"
    @select-action="emit('select-action', $event)"
    @select-recognition="(node, attemptIndex) => emit('select-recognition', node, attemptIndex)"
    @select-flow-item="(node, flowItemId) => emit('select-flow-item', node, flowItemId)"
  />
</template>
