<script setup lang="ts">
import NodeTimelineList from './NodeTimelineList.vue'
import type { NodeInfo } from '../../../types'

type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

const props = defineProps<{
  currentNodes: NodeTimelineItem[]
  selectedTaskKey?: string | null
  displayMode: string
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
}>()

const emit = defineEmits<{
  'scroller-mounted': [scroller: object | null]
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
    item-padding="8px 4px"
    scroller-style="flex: 1; min-height: 0"
    wrapper-style="flex: 1; min-height: 0"
    @scroller-mounted="emit('scroller-mounted', $event)"
    @select-node="emit('select-node', $event)"
    @select-action="emit('select-action', $event)"
    @select-recognition="(node, attemptIndex) => emit('select-recognition', node, attemptIndex)"
    @select-flow-item="(node, flowItemId) => emit('select-flow-item', node, flowItemId)"
  />
</template>
