<script setup lang="ts">
import { NDivider, NEmpty, NFlex, NIcon, NText } from 'naive-ui'
import { FileTextOutlined } from '@vicons/antd'

const props = defineProps<{
  fileName: string
  fileSizeInMB: number
  totalLines: number
}>()
</script>

<template>
  <div style="padding: 40px 20px; text-align: center; flex: 1">
    <n-empty description="大文件流式模式">
      <template #icon>
        <n-icon size="48" color="#f2c97d">
          <file-text-outlined />
        </n-icon>
      </template>
      <template #extra>
        <n-flex vertical style="gap: 12px; margin-top: 16px">
          <n-text depth="2" style="font-size: 14px">
            文件: {{ props.fileName }}
          </n-text>
          <n-text depth="3" style="font-size: 13px">
            大小: {{ props.fileSizeInMB.toFixed(2) }} MB
          </n-text>
          <n-text depth="3" style="font-size: 13px">
            行数: {{ props.totalLines }}
          </n-text>
          <n-divider style="margin: 8px 0" />
          <n-text type="success" style="font-size: 13px">
            ✅ 采用流式加载，内存占用极小
          </n-text>
          <n-text depth="3" style="font-size: 12px">
            搜索时边读边搜，不保存完整文件
          </n-text>
          <n-text depth="3" style="font-size: 12px">
            💡 点击左侧搜索结果查看上下文
          </n-text>
        </n-flex>
      </template>
    </n-empty>
  </div>
</template>
