<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { NButton, NCollapseItem, NIcon, NText } from 'naive-ui'
import { CopyOutlined } from '@vicons/antd'
import RawJsonTree from './RawJsonTree.vue'

const props = defineProps<{
  title: string
  name: string
  value: any
  expandedNames: string[]
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
  maxHeight?: string
  defaultExpandAll?: boolean
}>()

const code = ref('')
const codeReady = ref(false)
const treeReady = ref(false)
const mounted = ref(false)
let loadTimer: number | null = null
const isExpanded = computed(() => props.expandedNames.includes(props.name))

const ensureCode = () => {
  if (loadTimer != null) {
    window.clearTimeout(loadTimer)
    loadTimer = null
  }
  if (codeReady.value) return code.value
  code.value = props.formatJson(props.value)
  codeReady.value = true
  return code.value
}

const scheduleTreeLoad = () => {
  if (!mounted.value || !isExpanded.value || treeReady.value || loadTimer != null) return
  loadTimer = window.setTimeout(() => {
    loadTimer = null
    if (isExpanded.value) {
      treeReady.value = true
    }
  }, 80)
}

watch(
  () => props.value,
  () => {
    code.value = ''
    codeReady.value = false
    // Realtime snapshots replace object references even when the selected item is unchanged.
    // Keep an already-rendered tree mounted; its computed nodes react to the new value in place.
    scheduleTreeLoad()
  },
)

watch(
  isExpanded,
  (expanded) => {
    if (expanded) {
      scheduleTreeLoad()
    } else if (loadTimer != null) {
      window.clearTimeout(loadTimer)
      loadTimer = null
    }
  },
)

onMounted(() => {
  mounted.value = true
  scheduleTreeLoad()
})

onUnmounted(() => {
  if (loadTimer != null) {
    window.clearTimeout(loadTimer)
    loadTimer = null
  }
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
    <div
      v-if="isExpanded"
      class="raw-json-tree-wrap"
      :style="{ maxHeight: props.maxHeight ?? '500px' }"
    >
      <raw-json-tree
        v-if="treeReady"
        :value="props.value"
        :default-expand-all="props.defaultExpandAll"
        :format-json="props.formatJson"
        :copy-to-clipboard="props.copyToClipboard"
        root
      />
      <n-text v-else depth="3" style="font-size: 13px">
        正在准备原始 JSON。
        <n-button text type="primary" @click.stop="treeReady = true">立即加载</n-button>
      </n-text>
    </div>
  </n-collapse-item>
</template>

<style scoped>
.raw-json-tree-wrap {
  overflow: auto;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.06);
}
</style>
