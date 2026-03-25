<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NPopover, NText } from 'naive-ui'

const props = withDefaults(defineProps<{
  taskName: string
  enabled?: boolean
  requestTaskDoc?: ((task: string) => Promise<string | null>) | null
  maxWidth?: string
}>(), {
  enabled: false,
  requestTaskDoc: null,
  maxWidth: '420px',
})

const normalizeTaskName = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const normalizedTaskName = computed(() => normalizeTaskName(props.taskName))
const canQuery = computed(() => props.enabled && !!props.requestTaskDoc && !!normalizedTaskName.value)

const popoverVisible = ref(false)
const hoverActive = ref(false)
const docText = ref('')
const docLoaded = ref(false)
const docLoading = ref(false)
let requestToken = 0

watch(normalizedTaskName, () => {
  popoverVisible.value = false
  hoverActive.value = false
  docText.value = ''
  docLoaded.value = false
  docLoading.value = false
  requestToken += 1
}, { flush: 'sync' })

const handleMouseEnter = () => {
  hoverActive.value = true
  if (!canQuery.value) return

  if (docText.value) {
    popoverVisible.value = true
    return
  }
  if (docLoaded.value || docLoading.value) return

  docLoading.value = true
  const token = ++requestToken
  void props.requestTaskDoc!(normalizedTaskName.value)
    .then((doc) => {
      if (token !== requestToken) return
      docLoaded.value = true
      const normalizedDoc = normalizeTaskName(doc)
      if (!normalizedDoc) {
        popoverVisible.value = false
        return
      }
      docText.value = normalizedDoc
      if (hoverActive.value) {
        popoverVisible.value = true
      }
    })
    .catch(() => {
      if (token !== requestToken) return
      docLoaded.value = false
      popoverVisible.value = false
    })
    .finally(() => {
      if (token === requestToken) {
        docLoading.value = false
      }
    })
}

const handleMouseLeave = () => {
  hoverActive.value = false
  popoverVisible.value = false
}
</script>

<template>
  <n-popover
    trigger="manual"
    :show="popoverVisible"
    :disabled="!docText"
    :show-arrow="true"
    :style="{ maxWidth }"
  >
    <template #trigger>
      <span class="task-doc-hover-trigger" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
        <slot />
      </span>
    </template>
    <n-text style="white-space: pre-wrap; line-height: 1.5; font-size: 12px">
      {{ docText }}
    </n-text>
  </n-popover>
</template>

<style scoped>
.task-doc-hover-trigger {
  display: inline-flex;
}
</style>
