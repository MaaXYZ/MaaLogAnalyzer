<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NCard, NFlex, NText } from 'naive-ui'
import type { TourStep } from '../tutorial/types'

interface RectLike {
  top: number
  left: number
  width: number
  height: number
}

const props = defineProps<{
  active: boolean
  step: TourStep | null
  stepIndex: number
  totalSteps: number
  sectionTitle: string
  sectionIndex: number
  sectionTotal: number
  sectionStepIndex: number
  sectionStepTotal: number
  targetRect: RectLike | null
  targetFound: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  finish: []
  skip: []
  retry: []
}>()

const canPrev = computed(() => props.stepIndex > 0)
const isLast = computed(() => props.stepIndex >= props.totalSteps - 1)
const prevLabel = computed(() => props.step?.prevLabel || '上一步')
const nextLabel = computed(() => props.step?.nextLabel || '下一步')

const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)

const updateViewport = () => {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

onMounted(() => {
  window.addEventListener('resize', updateViewport)
  window.addEventListener('orientationchange', updateViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('orientationchange', updateViewport)
})

const viewport = computed(() => ({
  width: viewportWidth.value,
  height: viewportHeight.value,
}))

const isMobileViewport = computed(() => viewport.value.width <= 900)

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min
  return Math.max(min, Math.min(value, max))
}

// Hide card/highlight briefly while switching steps.
const stepSwitching = ref(false)
let switchTimer: ReturnType<typeof setTimeout> | null = null

const clearSwitchTimer = () => {
  if (!switchTimer) return
  clearTimeout(switchTimer)
  switchTimer = null
}

watch(
  () => props.active,
  (active) => {
    if (!active) {
      clearSwitchTimer()
      stepSwitching.value = false
      return
    }

    stepSwitching.value = true
    clearSwitchTimer()
    switchTimer = setTimeout(() => {
      stepSwitching.value = false
      switchTimer = null
    }, 1200)
  },
)
watch(
  () => props.step?.id,
  (nextId, prevId) => {
    if (!nextId || nextId === prevId) return
    stepSwitching.value = true
    clearSwitchTimer()
    // Failsafe: never keep it hidden forever.
    switchTimer = setTimeout(() => {
      stepSwitching.value = false
      switchTimer = null
    }, 1200)
  },
)

watch(
  () => [
    props.targetFound,
    props.targetRect?.top,
    props.targetRect?.left,
    props.targetRect?.width,
    props.targetRect?.height,
  ],
  () => {
    if (!stepSwitching.value) return
    if (!props.targetFound || !props.targetRect) return
    clearSwitchTimer()
    // Let layout settle for one frame before showing.
    requestAnimationFrame(() => {
      stepSwitching.value = false
    })
  },
)

const maskTopStyle = computed(() => {
  if (!props.targetRect || !props.targetFound) {
    return { top: '0px', left: '0px', width: '100vw', height: '100vh' }
  }
  return {
    top: '0px',
    left: '0px',
    width: '100vw',
    height: `${Math.max(0, props.targetRect.top)}px`,
  }
})

const maskBottomStyle = computed(() => {
  if (!props.targetRect || !props.targetFound) {
    return { top: '0px', left: '0px', width: '0px', height: '0px' }
  }
  const top = props.targetRect.top + props.targetRect.height
  return {
    top: `${top}px`,
    left: '0px',
    width: '100vw',
    height: `${Math.max(0, viewport.value.height - top)}px`,
  }
})

const maskLeftStyle = computed(() => {
  if (!props.targetRect || !props.targetFound) {
    return { top: '0px', left: '0px', width: '0px', height: '0px' }
  }
  return {
    top: `${props.targetRect.top}px`,
    left: '0px',
    width: `${Math.max(0, props.targetRect.left)}px`,
    height: `${props.targetRect.height}px`,
  }
})

const maskRightStyle = computed(() => {
  if (!props.targetRect || !props.targetFound) {
    return { top: '0px', left: '0px', width: '0px', height: '0px' }
  }
  const left = props.targetRect.left + props.targetRect.width
  return {
    top: `${props.targetRect.top}px`,
    left: `${left}px`,
    width: `${Math.max(0, viewport.value.width - left)}px`,
    height: `${props.targetRect.height}px`,
  }
})

const highlightStyle = computed(() => {
  if (!props.targetRect || !props.targetFound || stepSwitching.value) {
    return { display: 'none' }
  }
  return {
    top: `${props.targetRect.top}px`,
    left: `${props.targetRect.left}px`,
    width: `${props.targetRect.width}px`,
    height: `${props.targetRect.height}px`,
  }
})

const cardStyle = computed(() => {
  const safeGap = isMobileViewport.value ? 8 : 12
  const width = Math.min(isMobileViewport.value ? 420 : 380, viewport.value.width - safeGap * 2)
  const cardHeightEstimate = isMobileViewport.value ? 360 : 260
  const maxTop = Math.max(safeGap, viewport.value.height - cardHeightEstimate - safeGap)
  const maxLeft = Math.max(safeGap, viewport.value.width - width - safeGap)
  const maxHeight = Math.max(220, viewport.value.height - safeGap * 2)

  if (!props.targetRect || !props.targetFound) {
    const centerLeft = Math.round((viewport.value.width - width) / 2)
    const centerTop = Math.round((viewport.value.height - cardHeightEstimate) / 2)
    return {
      width: `${width}px`,
      left: `${clamp(centerLeft, safeGap, maxLeft)}px`,
      top: `${clamp(centerTop, safeGap, maxTop)}px`,
      maxHeight: `${maxHeight}px`,
    }
  }

  const gap = 12
  const rect = props.targetRect
  const centerX = rect.left + rect.width / 2
  const placeBottom = rect.top + rect.height + cardHeightEstimate + safeGap <= viewport.value.height
  const rawTop = placeBottom ? rect.top + rect.height + gap : rect.top - cardHeightEstimate - gap

  const rawLeft = centerX - width / 2
  const left = clamp(rawLeft, safeGap, maxLeft)
  const top = clamp(rawTop, safeGap, maxTop)

  return {
    width: `${width}px`,
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    maxHeight: `${maxHeight}px`,
  }
})
</script>

<template>
  <div v-if="active" class="tour-overlay-root">
    <div class="tour-mask" :style="maskTopStyle" />
    <div class="tour-mask" :style="maskBottomStyle" />
    <div class="tour-mask" :style="maskLeftStyle" />
    <div class="tour-mask" :style="maskRightStyle" />

    <div class="tour-highlight" :style="highlightStyle" />

    <n-card v-show="!stepSwitching" class="tour-card" :style="cardStyle" :bordered="false">
      <n-flex vertical style="gap: 10px">
        <n-text depth="3" style="font-size: 12px">
          板块 {{ sectionIndex }} / {{ sectionTotal }} · {{ sectionTitle || '未分组' }}
        </n-text>
        <n-text depth="3" style="font-size: 12px">
          板块内步骤 {{ sectionStepIndex }} / {{ sectionStepTotal }} · 总步骤 {{ stepIndex + 1 }} /
          {{ totalSteps }}
        </n-text>
        <n-text strong style="font-size: 16px">{{ step?.title || '引导' }}</n-text>
        <n-text depth="2">{{ step?.content || '' }}</n-text>

        <n-text v-if="!targetFound" type="warning" style="font-size: 12px">
          当前步骤目标还未出现，可重试或先下一步。
        </n-text>

        <n-flex
          justify="space-between"
          align="center"
          style="margin-top: 4px; gap: 8px; flex-wrap: wrap"
        >
          <n-button tertiary @click="emit('skip')">跳过并完成</n-button>
          <n-flex style="gap: 8px; flex-wrap: wrap">
            <n-button v-if="!targetFound" tertiary @click="emit('retry')">重试定位</n-button>
            <n-button :disabled="!canPrev" @click="emit('prev')">{{ prevLabel }}</n-button>
            <n-button v-if="!isLast" type="primary" @click="emit('next')">{{ nextLabel }}</n-button>
            <n-button v-else type="primary" @click="emit('finish')">完成</n-button>
          </n-flex>
        </n-flex>
      </n-flex>
    </n-card>
  </div>
</template>

<style scoped>
.tour-overlay-root {
  position: fixed;
  inset: 0;
  z-index: 5000;
  pointer-events: none;
}

.tour-mask {
  position: fixed;
  background: rgba(0, 0, 0, 0.56);
  pointer-events: auto;
}

.tour-highlight {
  position: fixed;
  border: 2px solid #18a058;
  border-radius: 10px;
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0),
    0 0 0 4px rgba(24, 160, 88, 0.25);
  pointer-events: none;
}

.tour-card {
  position: fixed;
  z-index: 5001;
  pointer-events: auto;
  overflow: hidden;
}

.tour-card :deep(.n-card__content) {
  overflow: auto;
  max-height: calc(100vh - 96px);
}
</style>
