<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, getBezierPath, type EdgeProps } from '@vue-flow/core'
import type { FlowEdgeData } from '../utils/flowchartBuilder'

const props = defineProps<EdgeProps>()

function buildPathFromPoints(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return ''
  const [first, ...rest] = points
  return `M ${first.x},${first.y} ${rest.map((p) => `L ${p.x},${p.y}`).join(' ')}`
}

const adjustedRoutePoints = computed(() => {
  const edgeData = (props.data ?? {}) as FlowEdgeData
  const routePoints = Array.isArray(edgeData.routePoints) ? edgeData.routePoints : []
  if (routePoints.length < 2) return null

  const firstPoint = routePoints[0]
  const lastPoint = routePoints[routePoints.length - 1]

  const sourceX = typeof props.sourceX === 'number' ? props.sourceX : firstPoint.x
  const sourceY = typeof props.sourceY === 'number' ? props.sourceY : firstPoint.y
  const targetX = typeof props.targetX === 'number' ? props.targetX : lastPoint.x
  const targetY = typeof props.targetY === 'number' ? props.targetY : lastPoint.y

  const endpointMoved =
    Math.abs(firstPoint.x - sourceX) > 0.5 ||
    Math.abs(firstPoint.y - sourceY) > 0.5 ||
    Math.abs(lastPoint.x - targetX) > 0.5 ||
    Math.abs(lastPoint.y - targetY) > 0.5

  if (!endpointMoved) return routePoints

  const nextPoints = routePoints.map((p) => ({ x: p.x, y: p.y }))
  nextPoints[0] = { x: sourceX, y: sourceY }
  nextPoints[nextPoints.length - 1] = { x: targetX, y: targetY }
  return nextPoints
})

const path = computed(() => {
  if (adjustedRoutePoints.value && adjustedRoutePoints.value.length >= 2) {
    return buildPathFromPoints(adjustedRoutePoints.value)
  }
  return getBezierPath(props)[0]
})

const flowPathId = computed(() => {
  const safeId = String(props.id).replace(/[^a-zA-Z0-9_-]/g, '_')
  return `flow-edge-path-${safeId}`
})

const flowMode = computed(() => {
  const edgeData = (props.data ?? {}) as FlowEdgeData
  return edgeData.flowMode ?? 'none'
})

const edgeLength = computed(() => {
  const routePoints = adjustedRoutePoints.value ?? []

  let length = 0
  if (routePoints.length >= 2) {
    for (let i = 1; i < routePoints.length; i++) {
      const a = routePoints[i - 1]
      const b = routePoints[i]
      length += Math.hypot(b.x - a.x, b.y - a.y)
    }
  } else {
    const sourceX = typeof props.sourceX === 'number' ? props.sourceX : 0
    const sourceY = typeof props.sourceY === 'number' ? props.sourceY : 0
    const targetX = typeof props.targetX === 'number' ? props.targetX : sourceX
    const targetY = typeof props.targetY === 'number' ? props.targetY : sourceY
    // bezier fallback uses a bit more glyphs than direct distance to avoid sparse arrows
    length = Math.hypot(targetX - sourceX, targetY - sourceY) * 1.25
  }

  return Math.max(1, length)
})

const chevronText = computed(() => {
  // Keep visual density unchanged; only increase total length coverage.
  const approxGlyphAdvancePx = 7
  // Guard against huge SVG text nodes on very long paths (web browsers may render poorly).
  const count = Math.max(
    14,
    Math.min(420, Math.ceil((edgeLength.value + 96) / approxGlyphAdvancePx)),
  )
  return '>'.repeat(count)
})

const chevronDeltaPercent = computed(() => {
  // Match dashed-edge speed: 36px per 1.2s
  const deltaPercent = (36 / edgeLength.value) * 100
  return Math.max(1, Math.min(100, deltaPercent))
})

const chevronOffsetFrom = computed(() => {
  return `${(-chevronDeltaPercent.value).toFixed(2)}%`
})

const chevronOffsetTo = computed(() => {
  return `0%`
})

const chevronStroke = computed(() => {
  const raw = (props.style as Record<string, unknown> | undefined)?.stroke
  if (typeof raw === 'string' && raw.trim()) return raw
  return '#18a058'
})

const normalizedMarkerEnd = computed(() => {
  const raw = props.markerEnd
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  if (!value) return undefined
  if (value === '#' || value === 'url(#)' || value === "url('#')" || value === 'url("#")') {
    return undefined
  }
  return value
})
</script>

<template>
  <g>
    <path :id="flowPathId" :d="path" fill="none" stroke="none" />
    <BaseEdge :id="id" :path="path" :style="style" :marker-end="normalizedMarkerEnd" />
    <text
      v-if="flowMode === 'chevron'"
      class="flow-edge-chevron"
      fill="var(--flowchart-chevron-fill, #ffffff)"
      :stroke="chevronStroke"
      stroke-width="var(--flowchart-chevron-stroke-width, 1)"
      paint-order="stroke"
      dominant-baseline="middle"
    >
      <textPath :href="`#${flowPathId}`" startOffset="0%" dy="0.34em">
        {{ chevronText }}
        <animate
          attributeName="startOffset"
          :from="chevronOffsetFrom"
          :to="chevronOffsetTo"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </textPath>
    </text>
  </g>
</template>

<style scoped>
.flow-edge-chevron {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  opacity: 0.95;
  pointer-events: none;
  user-select: none;
}
</style>
