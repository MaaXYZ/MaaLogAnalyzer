<script setup lang="ts">
import {
  NButton, NCard, NCode, NCollapse, NCollapseItem, NDivider, NFlex,
  NIcon, NTag, NText,
} from 'naive-ui'
import { CopyOutlined } from '@vicons/antd'
import type { FocusCardData } from '../composables/types'
import { renderFocusRichText } from '../composables/focusRichText'

const props = defineProps<{
  focusCard: FocusCardData
  rawJsonDefaultExpanded: string[]
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
}>()

const sourceLabelMap: Record<FocusCardData['sourceKind'], string> = {
  node: '节点',
  recognition: '识别',
  action: '动作',
}

const phaseLabelMap = {
  starting: '开始',
  succeeded: '成功',
  failed: '失败',
} as const

const phaseTagTypeMap = {
  starting: 'info',
  succeeded: 'success',
  failed: 'error',
} as const

</script>

<template>
  <n-card>
    <template #header>
      🎯 Focus
    </template>
    <template #header-extra>
      <n-tag size="small" type="warning">
        {{ sourceLabelMap[props.focusCard.sourceKind] }}
      </n-tag>
    </template>

    <div
      v-for="(entry, index) in props.focusCard.entries"
      :key="`${entry.message ?? 'generic'}-${index}`"
    >
      <n-flex justify="space-between" align="center" style="gap: 12px; margin-bottom: 8px">
        <n-flex align="center" style="gap: 8px">
          <n-text code>{{ entry.message ?? '通用 Focus' }}</n-text>
          <n-tag
            v-if="entry.phase"
            size="small"
            :type="phaseTagTypeMap[entry.phase]"
          >
            {{ phaseLabelMap[entry.phase] }}
          </n-tag>
        </n-flex>

        <n-button
          size="tiny"
          @click.stop="props.copyToClipboard(entry.resolvedContent)"
        >
          <template #icon>
            <n-icon><copy-outlined /></n-icon>
          </template>
          复制内容
        </n-button>
      </n-flex>

      <n-flex style="gap: 8px; margin-bottom: 8px">
        <n-tag
          v-for="channel in entry.display"
          :key="`${channel}-${index}`"
          size="small"
          type="primary"
        >
          {{ channel }}
        </n-tag>
      </n-flex>

      <div
        class="focus-detail-content rich-text-content"
        v-html="renderFocusRichText(entry.resolvedContent)"
      />

      <n-divider v-if="index < props.focusCard.entries.length - 1" style="margin: 16px 0" />
    </div>

    <n-collapse style="margin-top: 16px" :default-expanded-names="props.rawJsonDefaultExpanded">
      <n-collapse-item title="原始 focus 配置" name="focus-config">
        <template #header-extra>
          <n-button
            size="tiny"
            @click.stop="props.copyToClipboard(props.formatJson(props.focusCard.rawFocus))"
          >
            <template #icon>
              <n-icon><copy-outlined /></n-icon>
            </template>
            复制
          </n-button>
        </template>
        <n-code
          :code="props.formatJson(props.focusCard.rawFocus)"
          language="json"
          :word-wrap="true"
          style="max-height: 320px; overflow: auto; max-width: 100%"
        />
      </n-collapse-item>
    </n-collapse>
  </n-card>
</template>

<style scoped>
.focus-detail-content {
  word-break: break-word;
  border-radius: 8px;
  padding: 12px;
  background: rgba(148, 163, 184, 0.12);
  line-height: 1.6;
}

.rich-text-content :deep(p) {
  margin: 0 0 12px;
}

.rich-text-content :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text-content :deep(a) {
  color: var(--n-primary-color);
  text-decoration: underline;
}

.rich-text-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.08);
}

.rich-text-content :deep(pre) {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.08);
  overflow: auto;
}

.rich-text-content :deep(blockquote) {
  margin: 8px 0 0;
  padding-left: 12px;
  border-left: 3px solid rgba(148, 163, 184, 0.45);
  color: rgba(15, 23, 42, 0.75);
}

.rich-text-content :deep(h1),
.rich-text-content :deep(h2),
.rich-text-content :deep(h3),
.rich-text-content :deep(h4),
.rich-text-content :deep(h5),
.rich-text-content :deep(h6) {
  margin: 0 0 12px;
  line-height: 1.3;
}

.rich-text-content :deep(ul),
.rich-text-content :deep(ol) {
  margin: 8px 0 0;
  padding-left: 20px;
}

.rich-text-content :deep(table) {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
}

.rich-text-content :deep(th),
.rich-text-content :deep(td) {
  padding: 6px 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  text-align: left;
}

.rich-text-content :deep(hr) {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid rgba(148, 163, 184, 0.35);
}

.rich-text-content :deep(img) {
  max-width: 100%;
}
</style>
