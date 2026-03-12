<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, type EdgeProps } from '@vue-flow/core'
import type { FlowEdgeData } from '../utils/flowchartBuilder'

const props = defineProps<EdgeProps>()

function buildPathFromPoints(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return ''
  const [first, ...rest] = points
  return `M ${first.x},${first.y} ${rest.map(p => `L ${p.x},${p.y}`).join(' ')}`
}

const path = computed(() => {
  const edgeData = (props.data ?? {}) as FlowEdgeData
  const routePoints = Array.isArray(edgeData.routePoints) ? edgeData.routePoints : []
  if (routePoints.length >= 2) {
    return buildPathFromPoints(routePoints)
  }
  return `M ${props.sourceX},${props.sourceY} L ${props.targetX},${props.targetY}`
})
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path"
    :style="style"
    :marker-end="markerEnd"
  />
</template>
