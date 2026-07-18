<script setup lang="ts">
import ProcessTimelineListPane from './ProcessTimelineListPane.vue'
import type { NodeInfo } from '../../../types'

type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

const props = defineProps<{
  currentNodes: NodeTimelineItem[]
  selectedTaskKey?: string | null
  displayMode: string
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
  preserveScrollOnActivate?: boolean
}>()

const emit = defineEmits<{
  'scroller-mounted': [scroller: object | null]
  'manual-scroll-up': []
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
}>()
</script>

<template>
  <process-timeline-list-pane
    :current-nodes="props.currentNodes"
    :selected-task-key="props.selectedTaskKey"
    :display-mode="props.displayMode"
    :is-vscode-launch-embed="props.isVscodeLaunchEmbed"
    :bridge-request-task-doc="props.bridgeRequestTaskDoc"
    :bridge-reveal-task="props.bridgeRevealTask"
    :preserve-scroll-on-activate="props.preserveScrollOnActivate"
    item-padding="8px 4px"
    wrapper-style="flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative"
    @scroller-mounted="emit('scroller-mounted', $event)"
    @manual-scroll-up="emit('manual-scroll-up')"
    @select-node="emit('select-node', $event)"
    @select-action="emit('select-action', $event)"
    @select-recognition="(node, attemptIndex) => emit('select-recognition', node, attemptIndex)"
    @select-flow-item="(node, flowItemId) => emit('select-flow-item', node, flowItemId)"
  />
</template>
