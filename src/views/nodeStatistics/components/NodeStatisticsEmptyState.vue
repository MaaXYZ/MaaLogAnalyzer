<script setup lang="ts">
import type { UploadFileInfo } from 'naive-ui'
import {
  NButton,
  NEmpty,
  NIcon,
  NText,
  NUpload,
  NUploadDragger,
} from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined } from '@vicons/antd'

const props = defineProps<{
  isInTauri: boolean
  isVscodeLaunchEmbed: boolean
  loading: boolean
  uploadKey: number
  handleNaiveUpload: (options: { file: UploadFileInfo }) => boolean | Promise<boolean>
}>()

const emit = defineEmits<{
  tauriUploadClick: []
}>()
</script>

<template>
  <div style="padding: 40px">
    <n-empty
      v-if="props.isVscodeLaunchEmbed"
      description="请先在分析视图中加载日志"
    >
      <template #extra>
        <n-text depth="3">
          VS Code iframe 中的节点统计会复用当前已加载的日志数据，不单独提供导入入口。
        </n-text>
      </template>
    </n-empty>

    <div v-else-if="props.isInTauri" style="text-align: center">
      <n-button
        size="large"
        type="primary"
        :loading="props.loading"
        @click="emit('tauriUploadClick')"
      >
        <template #icon>
          <n-icon>
            <folder-open-outlined />
          </n-icon>
        </template>
        选择日志文件
      </n-button>
      <n-text depth="3" style="display: block; margin-top: 16px">
        点击按钮选择 MAA 日志文件进行分析
      </n-text>
    </div>

    <n-upload
      v-else
      :key="props.uploadKey"
      :custom-request="props.handleNaiveUpload"
      :show-file-list="false"
      accept=".log,.txt,.zip"
    >
      <n-upload-dragger>
        <div style="margin-bottom: 12px">
          <n-icon size="48" :depth="3">
            <cloud-upload-outlined />
          </n-icon>
        </div>
        <n-text style="font-size: 16px">
          点击或拖拽日志文件到此区域上传
        </n-text>
        <n-text depth="3" style="margin-top: 8px">
          支持 .log、.txt 和 .zip 格式的 MAA 日志文件
        </n-text>
      </n-upload-dragger>
    </n-upload>
  </div>
</template>
