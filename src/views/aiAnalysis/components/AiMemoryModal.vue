<script setup lang="ts">
import { computed } from 'vue'
import { NModal } from 'naive-ui'

interface Props {
  show: boolean
  content: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const showModel = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
})
</script>

<template>
  <n-modal
    v-model:show="showModel"
    preset="card"
    title="当前任务记忆全文"
    :style="{ width: 'min(860px, 92vw)' }"
  >
    <div class="memory-modal-body">
      <pre class="memory-modal-text">{{ props.content }}</pre>
    </div>
  </n-modal>
</template>

<style scoped>
.memory-modal-body {
  max-height: min(72vh, 760px);
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
}

.memory-modal-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.5;
  font-size: 12px;
}
</style>
