<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NCard, NFlex, NDescriptions, NDescriptionsItem, NTag,
  NText, NCollapse, NButton,
  NTabs, NTabPane // <-- 1. 新增引入 Tabs 相关组件
} from 'naive-ui'
import type { UnifiedFlowItem } from '../../../types'
import SafePreviewImage from '../../../components/SafePreviewImage.vue'
import RawJsonCollapseItem from './RawJsonCollapseItem.vue'
import { buildRecognitionDetailRows, formatDetailValue } from './detailRows'

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

const expandedNames = ref<string[]>([...props.rawJsonDefaultExpanded])
watch(
  () => props.rawJsonDefaultExpanded,
  (names) => {
    expandedNames.value = [...names]
  },
)

const recognitionDetailRows = computed(() => buildRecognitionDetailRows(props.currentRecognition, props.descriptionColumns))

const getRecognitionHitTagType = (value: unknown) => value === '命中' ? 'success' : 'error'
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

      <n-descriptions-item
        v-for="row in recognitionDetailRows"
        :key="row.label"
        :label="row.label"
        :span="row.span"
      >
        <n-tag
          v-if="row.label === '命中状态'"
          :type="getRecognitionHitTagType(row.value)"
          size="small"
        >
          {{ formatDetailValue(row.value) }}
        </n-tag>
        <n-text v-else code class="detail-value">
          {{ formatDetailValue(row.value) }}
        </n-text>
      </n-descriptions-item>
    </n-descriptions>

    <div v-if="props.bridgeRecognitionLoading" style="margin-top: 12px">
      <n-text depth="3" style="font-size: 13px">正在加载高清截图...</n-text>
    </div>
    <div v-if="props.bridgeRecognitionError" style="margin-top: 12px">
      <n-text type="error" style="font-size: 13px">{{ props.bridgeRecognitionError }}</n-text>
    </div>

    <n-tabs 
      v-if="props.bridgeRecognitionRawImage || props.currentAttempt?.vision_image || props.bridgeRecognitionDrawImages.length > 0 || props.currentAttempt?.error_image"
      type="line" 
      size="small" 
      animated 
      default-value="draw"
      style="margin-top: 16px"
    >
      <n-tab-pane
        v-if="props.bridgeRecognitionDrawImages.length > 0 || props.currentAttempt?.vision_image"
        name="draw"
        :tab="props.bridgeRecognitionDrawImages.length > 0 ? `解析图 (Draw - ${props.bridgeRecognitionDrawImages.length})` : '解析图 (Draw)'"
      >
        <n-flex vertical style="gap: 8px">
          <safe-preview-image
            v-for="(img, idx) in props.bridgeRecognitionDrawImages"
            :key="`draw-${idx}-${img.slice(0, 24)}`"
            :src="props.resolveImageSrc(img)"
            class="detail-preview-image"
          />
          <safe-preview-image
            v-if="props.bridgeRecognitionDrawImages.length === 0 && props.currentAttempt?.vision_image"
            :src="props.resolveImageSrc(props.currentAttempt.vision_image)"
            class="detail-preview-image"
          />
        </n-flex>
      </n-tab-pane>

      <n-tab-pane
        v-if="props.bridgeRecognitionRawImage || props.currentAttempt?.error_image"
        name="raw"
        tab="原图 (Raw)"
      >
        <safe-preview-image 
          v-if="props.bridgeRecognitionRawImage"
          :src="props.resolveImageSrc(props.bridgeRecognitionRawImage)" 
          class="detail-preview-image" 
        />
        <safe-preview-image 
          v-else-if="props.currentAttempt?.error_image"
          :src="props.resolveImageSrc(props.currentAttempt.error_image)" 
          class="detail-preview-image" 
        />
      </n-tab-pane>

      <n-tab-pane
        v-if="props.currentAttempt?.error_image && props.bridgeRecognitionRawImage"
        name="error"
        tab="错误截图 (Error)"
      >
        <safe-preview-image 
          :src="props.resolveImageSrc(props.currentAttempt.error_image)" 
          class="detail-preview-image" 
        />
      </n-tab-pane>
    </n-tabs>

    <n-collapse v-model:expanded-names="expandedNames" style="margin-top: 16px">
      <raw-json-collapse-item
        title="原始识别数据"
        name="reco-json"
        :value="props.currentRecognition"
        :expanded-names="expandedNames"
        :format-json="props.formatJson"
        :copy-to-clipboard="props.copyToClipboard"
        max-height="400px"
        default-expand-all
      />
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

.detail-value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 微调 Tabs 面板的内边距，让图片更紧凑 */
:deep(.n-tabs-pane-wrapper) {
  padding-top: 12px !important;
}
</style>
