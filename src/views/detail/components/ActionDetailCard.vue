<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NTag,
  NFlex,
  NButton,
  NText,
  NCollapse,
} from 'naive-ui'
import type { NodeInfo } from '../../../types'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'
import SafePreviewImage from '../../../components/SafePreviewImage.vue'
import RawJsonCollapseItem from './RawJsonCollapseItem.vue'
import { buildActionDetailRows, formatDetailValue } from './detailRows'

const props = defineProps<{
  currentActionDetails: any
  currentActionStatus: 'success' | 'failed' | 'running' | null
  actionErrorImage: string | null
  /** 叠加点击点标记用的截图；失败 = error_image，成功 = 节点识别帧 */
  actionScreenshot: string | null
  actionExecutionTime: string
  descriptionColumns: number
  selectedNode: NodeInfo | null
  rawJsonDefaultExpanded: string[]
  resolveImageSrc: (source: string) => string
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
  showOpenCropButton: boolean
  openErrorImageInCrop: () => void | Promise<void>
  onSearchInSource?: (keyword: string, locate?: string) => void
}>()

const expandedNames = ref<string[]>([...props.rawJsonDefaultExpanded])
watch(
  () => props.rawJsonDefaultExpanded,
  (names) => {
    expandedNames.value = [...names]
  },
)

const actionDetailRows = computed(() =>
  buildActionDetailRows(props.currentActionDetails, props.descriptionColumns),
)

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// 目标区域（随机/滑动范围）；Click 的 box 是 [x,y,w,h] Rect
const actionBox = computed<[number, number, number, number] | null>(() => {
  const box = props.currentActionDetails?.box
  if (!Array.isArray(box) || box.length !== 4) return null
  if (!box.every(isNum)) return null
  return box as [number, number, number, number]
})

// 实际落点：detail.point 优先（Click 随机偏移后的真坐标），否则 box 中心，
// box 是 2 元点时直接用
const actionPoint = computed<[number, number] | null>(() => {
  const point = props.currentActionDetails?.detail?.point
  if (Array.isArray(point) && point.length === 2 && point.every(isNum)) {
    return point as [number, number]
  }
  const box = props.currentActionDetails?.box
  if (!Array.isArray(box)) return null
  if (box.length === 2 && box.every(isNum)) {
    return box as [number, number]
  }
  if (box.length === 4 && box.every(isNum)) {
    return [box[0] + box[2] / 2, box[1] + box[3] / 2]
  }
  return null
})

// 把目标框 + 落点直接烘进截图像素（canvas 合成 data URL）：
// 用户点开 n-image 大图预览时 CSS 叠层会丢，烘进图里就一直在
const resolvedScreenshot = computed(() =>
  props.actionScreenshot ? props.resolveImageSrc(props.actionScreenshot) : null,
)
const markedScreenshot = ref<string | null>(null)
watch(
  [resolvedScreenshot, actionPoint, actionBox],
  async ([src, point, box]) => {
    markedScreenshot.value = null
    if (!src) return
    const img = new Image()
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = src
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    // 目标区域（虚线红框）：Click 的 box 是随机点击范围
    if (box) {
      ctx.save()
      ctx.strokeStyle = '#f03e3e'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(box[0], box[1], box[2], box[3])
      ctx.restore()
    }
    // 实际落点：白边红十字 + 圆点
    if (point) {
      const [px, py] = point
      const arm = 14
      ctx.save()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(px - arm, py)
      ctx.lineTo(px + arm, py)
      ctx.moveTo(px, py - arm)
      ctx.lineTo(px, py + arm)
      ctx.stroke()
      ctx.strokeStyle = '#f03e3e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px - arm, py)
      ctx.lineTo(px + arm, py)
      ctx.moveTo(px, py - arm)
      ctx.lineTo(px, py + arm)
      ctx.stroke()
      ctx.fillStyle = '#f03e3e'
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
    markedScreenshot.value = canvas.toDataURL('image/png')
  },
  { immediate: true },
)

// 动作原文定位：用节点名检索更可靠（动作类型如 click 太泛），时间戳优先用动作自身的
const handleSearchInSource = () => {
  const keyword = props.currentActionDetails?.name || props.selectedNode?.name
  if (!keyword) return
  const locate = props.currentActionDetails?.ts || props.selectedNode?.ts
  props.onSearchInSource?.(keyword, locate)
}
</script>

<template>
  <n-card>
    <template #header>
      <n-flex align="center" justify="space-between" style="flex-wrap: nowrap">
        <span>⚡ 动作详情</span>
        <n-button
          v-if="props.onSearchInSource"
          size="tiny"
          title="跳转到文本搜索，查看该动作的原始日志上下文"
          @click.stop="handleSearchInSource"
        >
          在原文中查看
        </n-button>
      </n-flex>
    </template>
    <n-descriptions :column="props.descriptionColumns" size="small" label-placement="left" bordered>
      <n-descriptions-item label="动作 ID">
        {{ props.currentActionDetails?.action_id }}
      </n-descriptions-item>

      <n-descriptions-item label="动作类型">
        <n-tag
          size="small"
          :type="props.currentActionDetails?.action === 'DoNothing' ? 'default' : 'primary'"
        >
          {{ props.currentActionDetails?.action || 'Unknown' }}
        </n-tag>
      </n-descriptions-item>

      <n-descriptions-item label="节点名称">
        {{ props.currentActionDetails?.name }}
      </n-descriptions-item>

      <n-descriptions-item label="执行结果">
        <n-tag
          :type="
            props.currentActionStatus
              ? getRuntimeStatusTagType(props.currentActionStatus)
              : 'default'
          "
          size="small"
        >
          {{ props.currentActionStatus ? getRuntimeStatusText(props.currentActionStatus) : '-' }}
        </n-tag>
      </n-descriptions-item>

      <n-descriptions-item label="执行时间">
        {{ props.actionExecutionTime }}
      </n-descriptions-item>

      <n-descriptions-item
        label="目标位置"
        :span="props.descriptionColumns"
        v-if="props.currentActionDetails?.box"
      >
        <n-text code> [{{ props.currentActionDetails.box.join(', ') }}] </n-text>
      </n-descriptions-item>

      <n-descriptions-item
        v-for="row in actionDetailRows"
        :key="row.label"
        :label="row.label"
        :span="row.span"
      >
        <n-text code class="detail-value">
          {{ formatDetailValue(row.value) }}
        </n-text>
      </n-descriptions-item>
    </n-descriptions>

    <div v-if="resolvedScreenshot" style="margin-top: 12px">
      <n-flex align="center" justify="space-between" style="margin-bottom: 8px">
        <n-text depth="3" style="font-size: 13px">
          {{
            props.currentActionStatus === 'failed' && props.actionErrorImage
              ? '失败截图'
              : '动作位置（识别帧，虚线=点击范围）'
          }}
        </n-text>
        <n-button
          v-if="props.showOpenCropButton"
          size="tiny"
          @click.stop="props.openErrorImageInCrop"
        >
          打开截图工具
        </n-button>
      </n-flex>
      <safe-preview-image
        :src="markedScreenshot ?? resolvedScreenshot"
        class="detail-preview-image"
      />
    </div>

    <n-collapse v-model:expanded-names="expandedNames" style="margin-top: 16px">
      <raw-json-collapse-item
        title="原始动作数据"
        name="action-json"
        :value="props.currentActionDetails"
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
</style>
