<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NFlex, NText, NProgress } from 'naive-ui'

interface Props {
  show: boolean
  width: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
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
    title="正在读取日志文件"
    :style="{ width: props.width }"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
  >
    <n-flex vertical style="gap: 20px; padding: 20px 0">
      <n-text style="text-align: center; font-size: 16px">
        正在读取文件内容...
      </n-text>
      <n-progress
        type="line"
        :percentage="100"
        :show-indicator="false"
        :height="24"
        status="info"
        processing
      />
      <n-text depth="3" style="text-align: center; font-size: 13px">
        请稍候，文件读取完成后将开始解析
      </n-text>
    </n-flex>
  </n-modal>
</template>
