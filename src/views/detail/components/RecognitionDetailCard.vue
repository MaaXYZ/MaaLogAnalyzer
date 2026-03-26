<script setup lang="ts">
import {
  NCard, NFlex, NDescriptions, NDescriptionsItem, NTag,
  NText, NImage, NCollapse, NCollapseItem, NButton, NIcon, NCode,
} from 'naive-ui'
import { CopyOutlined } from '@vicons/antd'
import type { UnifiedFlowItem } from '../../../types'

const props = defineProps<{
  currentRecognition: any
  currentAttempt: UnifiedFlowItem | null
  descriptionColumns: number
  recognitionExecutionTime: string
  isVscodeLaunchEmbed: boolean
  bridgeRecognitionRawImage: string | null
  bridgeRecognitionImageRefs?: {
    raw: number | null
    draws: number[]
  } | null
  bridgeRecognitionLoading?: boolean
  bridgeRecognitionError?: string | null
  bridgeRecognitionDrawImages: string[]
  rawJsonDefaultExpanded: string[]
  resolveImageSrc: (source: string) => string
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
  openRecognitionInCrop: () => void | Promise<void>
}>()
</script>

<template>
  <n-card>
    <template #header>
      🔍 识别详情
    </template>
    <template #header-extra>
      <n-flex v-if="props.isVscodeLaunchEmbed" align="center" style="gap: 6px">
        <n-button
          size="tiny"
          :disabled="!props.bridgeRecognitionRawImage && !(props.bridgeRecognitionImageRefs && props.bridgeRecognitionImageRefs.raw)"
          @click.stop="props.openRecognitionInCrop"
        >
          打开截图工具
        </n-button>
      </n-flex>
    </template>
    <n-descriptions :column="props.descriptionColumns" size="small" label-placement="left" bordered>
      <n-descriptions-item label="识别 ID">
        {{ props.currentRecognition?.reco_id }}
      </n-descriptions-item>

      <n-descriptions-item label="识别算法">
        <n-tag size="small" type="info">
          {{ props.currentRecognition?.algorithm || 'Unknown' }}
        </n-tag>
      </n-descriptions-item>

      <n-descriptions-item label="节点名称">
        {{ props.currentRecognition?.name }}
      </n-descriptions-item>

      <n-descriptions-item label="执行时间">
        {{ props.recognitionExecutionTime }}
      </n-descriptions-item>

      <n-descriptions-item label="识别位置" v-if="props.currentRecognition?.box">
        <n-text code>
          [{{ props.currentRecognition.box.join(', ') }}]
        </n-text>
      </n-descriptions-item>
    </n-descriptions>

    <div v-if="props.currentAttempt?.vision_image" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">调试截图</n-text>
      <img :src="props.resolveImageSrc(props.currentAttempt.vision_image)" style="max-width: 100%; border-radius: 4px" alt="调试截图" />
    </div>

    <div v-if="props.currentAttempt?.error_image" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">错误截图</n-text>
      <img :src="props.resolveImageSrc(props.currentAttempt.error_image)" style="max-width: 100%; border-radius: 4px" alt="错误截图" />
    </div>

    <div v-if="props.bridgeRecognitionLoading" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px">正在加载识别截图...</n-text>
    </div>

    <div v-if="props.bridgeRecognitionError" style="margin-top: 12px">
      <n-text type="error" style="font-size: 13px">{{ props.bridgeRecognitionError }}</n-text>
    </div>

    <div v-if="props.bridgeRecognitionDrawImages.length > 0" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">Draw ({{ props.bridgeRecognitionDrawImages.length }})</n-text>
      <n-flex vertical style="gap: 8px">
        <n-image
          v-for="(img, idx) in props.bridgeRecognitionDrawImages"
          :key="`${idx}-${img.slice(0, 24)}`"
          :src="props.resolveImageSrc(img)"
          class="detail-preview-image"
        />
      </n-flex>
    </div>

    <div v-if="props.bridgeRecognitionRawImage" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">Raw</n-text>
      <n-image :src="props.resolveImageSrc(props.bridgeRecognitionRawImage)" class="detail-preview-image" />
    </div>

    <n-collapse style="margin-top: 16px" :default-expanded-names="props.rawJsonDefaultExpanded">
      <n-collapse-item title="原始识别数据" name="reco-json">
        <template #header-extra>
          <n-button
            size="tiny"
            @click.stop="props.copyToClipboard(props.formatJson(props.currentRecognition))"
          >
            <template #icon>
              <n-icon><copy-outlined /></n-icon>
            </template>
            复制
          </n-button>
        </template>
        <n-code
          :code="props.formatJson(props.currentRecognition)"
          language="json"
          :word-wrap="true"
          style="max-height: 400px; overflow: auto; max-width: 100%"
        />
      </n-collapse-item>
    </n-collapse>
  </n-card>
</template>

<style scoped>
.detail-preview-image {
  display: block;
  max-width: 100%;
  width: 100%;
}

.detail-preview-image :deep(img) {
  display: block;
  max-width: 100%;
  width: 100%;
  height: auto;
  border-radius: 4px;
}
</style>
