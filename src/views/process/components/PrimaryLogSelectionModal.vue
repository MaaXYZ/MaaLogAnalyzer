<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NCheckbox, NFlex, NModal, NScrollbar, NTag, NText } from 'naive-ui'
import type { PrimaryLogSelectionOption } from '../../../utils/logFileDiscovery'

const props = defineProps<{
  show: boolean
  options: PrimaryLogSelectionOption[]
}>()

const emit = defineEmits<{
  confirm: [options: PrimaryLogSelectionOption[]]
  cancel: []
}>()

const selectedPaths = ref<string[]>([])

watch(
  () => props.options,
  (options) => {
    selectedPaths.value = options.filter((option) => option.selected).map((option) => option.path)
  },
  { immediate: true },
)

const selectedSet = computed(() => new Set(selectedPaths.value))
const allSelected = computed(
  () => props.options.length > 0 && selectedPaths.value.length === props.options.length,
)

const toggleAll = () => {
  selectedPaths.value = allSelected.value ? [] : props.options.map((option) => option.path)
}

const togglePath = (path: string, checked: boolean) => {
  const next = new Set(selectedPaths.value)
  if (checked) {
    next.add(path)
  } else {
    next.delete(path)
  }
  selectedPaths.value = props.options.map((option) => option.path).filter((path) => next.has(path))
}

const confirmSelection = () => {
  emit(
    'confirm',
    props.options
      .map((option) => ({
        ...option,
        selected: selectedSet.value.has(option.path),
      }))
      .filter((option) => option.selected),
  )
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    title="选择要加载的日志"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    style="width: min(720px, 92vw)"
  >
    <n-flex vertical :size="12">
      <n-text depth="3">
        默认已选中当前自动识别到的日志组，可取消不需要分析的历史 bak 日志。
      </n-text>

      <n-flex align="center" justify="space-between">
        <n-button size="small" secondary @click="toggleAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </n-button>
        <n-text depth="3">已选择 {{ selectedPaths.length }} / {{ props.options.length }}</n-text>
      </n-flex>

      <n-scrollbar style="max-height: 360px">
        <n-flex vertical :size="8">
          <div v-for="option in props.options" :key="option.path" class="primary-log-row">
            <n-checkbox
              :checked="selectedSet.has(option.path)"
              @update:checked="(checked) => togglePath(option.path, checked)"
            >
              <n-flex vertical :size="4">
                <n-flex align="center" :size="6">
                  <n-text strong>{{ option.name }}</n-text>
                  <n-tag size="small" :type="option.kind === 'main' ? 'success' : 'default'">
                    {{ option.kind === 'main' ? '当前日志' : '备份日志' }}
                  </n-tag>
                  <n-tag size="small">{{ option.family }}</n-tag>
                </n-flex>
                <n-text depth="3" class="primary-log-path">{{ option.path }}</n-text>
              </n-flex>
            </n-checkbox>
          </div>
        </n-flex>
      </n-scrollbar>

      <n-flex justify="end" :size="8">
        <n-button @click="emit('cancel')">取消</n-button>
        <n-button type="primary" :disabled="selectedPaths.length === 0" @click="confirmSelection">
          加载选中日志
        </n-button>
      </n-flex>
    </n-flex>
  </n-modal>
</template>

<style scoped>
.primary-log-row {
  padding: 10px 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
}

.primary-log-path {
  word-break: break-all;
}
</style>
