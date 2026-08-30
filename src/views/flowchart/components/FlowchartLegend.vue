<script setup lang="ts">
import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import { CaretDownOutlined, CaretUpOutlined } from '@vicons/antd'

const collapsed = ref(false)
</script>

<template>
  <div class="flowchart-legend" data-tour="flowchart-legend">
    <div class="legend-header" @click="collapsed = !collapsed">
      <span class="legend-title">图例</span>
      <n-icon size="12" :depth="3">
        <caret-up-outlined v-if="!collapsed" />
        <caret-down-outlined v-else />
      </n-icon>
    </div>
    <div v-show="!collapsed" class="legend-body">
      <div class="legend-row">
        <span class="chip chip-success" title="已执行且成功">成功</span>
        <span class="chip chip-failed" title="已执行但失败">失败</span>
        <span class="chip chip-running" title="正在执行">运行中</span>
        <span class="chip chip-notexec" title="流水线中存在但本次未执行">未执行</span>
      </div>
      <div class="legend-row legend-lines">
        <span class="line-sample"><span class="line line-exec" />已执行路径</span>
        <span class="line-sample"><span class="line line-jumpback" />回跳</span>
        <span class="line-sample"><span class="line line-jumpback-return" />回跳返回</span>
      </div>
      <div class="legend-row legend-lines">
        <span class="line-sample"><span class="line line-onerror" />异常跳转</span>
        <span class="line-sample"><span class="line line-notexec" />未执行</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flowchart-legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 20;
  background: color-mix(in srgb, var(--flowchart-panel-bg, #18181c) 88%, transparent);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 6px 10px;
  max-width: 300px;
  user-select: none;
}

.legend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  min-width: 30px;
}

/* 图例为固定深色卡片（与画布配色一致），内部文字不跟随主题色，避免浅色模式下不可读 */
.legend-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}

.legend-header :deep(.n-icon) {
  color: rgba(255, 255, 255, 0.6);
}

.legend-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.legend-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 5px;
  white-space: nowrap;
}

.chip-success {
  background: var(--flowchart-success-bg, rgba(24, 160, 88, 0.15));
  border: 1.5px solid var(--flowchart-success-border, #18a058);
  color: var(--flowchart-success-text, #18a058);
}

.chip-failed {
  background: var(--flowchart-failed-bg, rgba(208, 48, 80, 0.15));
  border: 1.5px solid var(--flowchart-failed-border, #d03050);
  color: var(--flowchart-failed-text, #d03050);
}

.chip-running {
  background: var(--flowchart-running-bg, rgba(240, 160, 32, 0.15));
  border: 1.5px solid var(--flowchart-running-border, #f0a020);
  color: var(--flowchart-running-text, #f0a020);
}

.chip-notexec {
  background: transparent;
  border: 1.5px dashed rgba(153, 153, 153, 0.7);
  color: rgba(153, 153, 153, 0.95);
}

.legend-lines {
  gap: 12px;
}

.line-sample {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.78);
  white-space: nowrap;
}

.line {
  display: inline-block;
  width: 22px;
  height: 0;
}

.line-exec {
  border-top: 3px solid #18a058;
}

.line-jumpback {
  border-top: 3px dashed #f0a020;
}

.line-jumpback-return {
  border-top: 3px dotted #f0a020;
}

.line-onerror {
  border-top: 3px dashed #d03050;
}

.line-notexec {
  border-top: 1.5px dashed rgba(153, 153, 153, 0.8);
}
</style>
