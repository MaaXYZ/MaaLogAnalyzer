<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NCode, NCollapseItem, NIcon, NText } from 'naive-ui'
import { CopyOutlined } from '@vicons/antd'

const props = defineProps<{
  title: string
  name: string
  value: any
  expandedNames: string[]
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
  maxHeight?: string
}>()

const code = ref('')
const codeReady = ref(false)
const mounted = ref(false)
const isExpanded = computed(() => props.expandedNames.includes(props.name))

const ensureCode = () => {
  if (codeReady.value) return code.value
  code.value = props.formatJson(props.value)
  codeReady.value = true
  return code.value
}

watch(
  () => props.value,
  () => {
    code.value = ''
    codeReady.value = false
  },
)

watch(
  isExpanded,
  (expanded, previous) => {
    if (expanded && mounted.value && previous === false) {
      ensureCode()
    }
  },
)

onMounted(() => {
  mounted.value = true
})

const handleCopy = () => {
  props.copyToClipboard(ensureCode())
}
</script>

<template>
  <n-collapse-item :title="props.title" :name="props.name">
    <template #header-extra>
      <n-button
        size="tiny"
        @click.stop="handleCopy"
      >
        <template #icon>
          <n-icon><copy-outlined /></n-icon>
        </template>
        复制
      </n-button>
    </template>
    <template v-if="isExpanded">
      <n-code
        v-if="codeReady"
        :code="code"
        language="json"
        :word-wrap="true"
        :style="{ maxHeight: props.maxHeight ?? '500px', overflow: 'auto', maxWidth: '100%' }"
      />
      <n-text v-else depth="3" style="font-size: 13px">
        原始 JSON 较大时高亮渲染可能比较慢。
        <n-button text type="primary" @click.stop="ensureCode">加载原始 JSON</n-button>
      </n-text>
    </template>
  </n-collapse-item>
</template>
