<script setup lang="ts">
import {
  NFlex,
  NModal,
  NProgress,
  NText,
} from 'naive-ui'

const props = defineProps<{
  showFileLoadingModal: boolean
  showParsingModal: boolean
  parseProgress: number
  isMobile: boolean
}>()
</script>

<template>
  <n-modal
    :show="props.showFileLoadingModal"
    preset="card"
    title="正在读取日志文件"
    :style="{ width: props.isMobile ? '90vw' : '500px' }"
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

  <n-modal
    :show="props.showParsingModal"
    preset="card"
    title="正在解析日志文件"
    :style="{ width: props.isMobile ? '90vw' : '500px' }"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
  >
    <n-flex vertical style="gap: 20px; padding: 20px 0">
      <n-text style="text-align: center; font-size: 16px">
        解析进度：{{ props.parseProgress }}%
      </n-text>
      <n-progress
        type="line"
        :percentage="props.parseProgress"
        :show-indicator="false"
        :height="24"
        status="success"
      />
      <n-text depth="3" style="text-align: center; font-size: 13px">
        正在分块处理日志，请稍候...
      </n-text>
    </n-flex>
  </n-modal>
</template>
