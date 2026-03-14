<script setup lang="ts">
import { NCard, NSwitch, NButton, NFlex, NText, NSelect, NRadioGroup, NRadioButton, useMessage } from 'naive-ui'
import { getSettings, saveSettings } from '../utils/settings'

const message = useMessage()
const settings = getSettings()

const playbackSpeedOptions = [
  { label: '慢速 1500ms', value: 1500 },
  { label: '标准 900ms', value: 900 },
  { label: '快速 600ms', value: 600 },
  { label: '极速 350ms', value: 350 },
]

const focusZoomOptions = [
  { label: '0.8x', value: 0.8 },
  { label: '1.0x', value: 1.0 },
  { label: '1.2x', value: 1.2 },
  { label: '1.4x', value: 1.4 },
  { label: '1.6x', value: 1.6 },
]

const handleSave = () => {
  saveSettings(settings)
  message.success('设置已保存')
}

const handleReset = () => {
  Object.assign(settings, {
    defaultCollapseRecognition: false,
    defaultCollapseNestedRecognition: true,
    defaultCollapseAction: true,
    defaultExpandRawJson: true,
    displayMode: 'tree',

    flowchartEdgeStyle: 'orthogonal',
    flowchartPlaybackIntervalMs: 900,
    flowchartFocusZoom: 1.0,
  })
  saveSettings(settings)
  message.success('已恢复默认设置')
}
</script>

<template>
  <n-card style="height: 100%">
    <n-card size="small" :bordered="true" style="margin-bottom: 12px">
      <n-text strong style="font-size: 16px; display: block; margin-bottom: 16px">日志分析</n-text>

      <table class="settings-grid" role="presentation">
        <tbody>
          <tr>
            <td>节点显示模式</td>
            <td>
              <n-radio-group v-model:value="settings.displayMode">
                <n-radio-button value="detailed">详细</n-radio-button>
                <n-radio-button value="compact">紧凑</n-radio-button>
                <n-radio-button value="tree">树形</n-radio-button>
              </n-radio-group>
            </td>
          </tr>

          <tr v-if="settings.displayMode === 'detailed' || settings.displayMode === 'tree'">
            <td>默认折叠根部识别列表</td>
            <td><n-switch v-model:value="settings.defaultCollapseRecognition" /></td>
          </tr>

          <tr v-if="settings.displayMode === 'detailed' || settings.displayMode === 'tree'">
            <td>默认折叠嵌套识别节点</td>
            <td><n-switch v-model:value="settings.defaultCollapseNestedRecognition" /></td>
          </tr>

          <tr v-if="settings.displayMode === 'detailed' || settings.displayMode === 'tree'">
            <td>默认折叠动作部分</td>
            <td><n-switch v-model:value="settings.defaultCollapseAction" /></td>
          </tr>

          <tr>
            <td>默认展开原始 JSON 数据</td>
            <td><n-switch v-model:value="settings.defaultExpandRawJson" /></td>
          </tr>
        </tbody>
      </table>
    </n-card>

    <n-card size="small" :bordered="true" style="margin-bottom: 12px">
      <n-text strong style="font-size: 16px; display: block; margin-bottom: 16px">流程图</n-text>

      <table class="settings-grid" role="presentation">
        <tbody>
          <tr>
            <td>连线方式</td>
            <td>
              <n-radio-group v-model:value="settings.flowchartEdgeStyle">
                <n-radio-button value="orthogonal">避障折线</n-radio-button>
                <n-radio-button value="default">平滑曲线</n-radio-button>
              </n-radio-group>
            </td>
          </tr>

          <tr>
            <td>回放速度</td>
            <td>
              <n-select
                v-model:value="settings.flowchartPlaybackIntervalMs"
                :options="playbackSpeedOptions"
                style="width: 180px; margin: 0 auto"
              />
            </td>
          </tr>

          <tr>
            <td>聚焦缩放</td>
            <td>
              <n-select
                v-model:value="settings.flowchartFocusZoom"
                :options="focusZoomOptions"
                style="width: 180px; margin: 0 auto"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </n-card>

    <n-flex style="margin-top: 24px; gap: 12px">
      <n-button type="primary" @click="handleSave">保存设置</n-button>
      <n-button @click="handleReset">恢复默认</n-button>
    </n-flex>
  </n-card>
</template>

<style scoped>
.settings-grid {
  --settings-border-color: var(--n-border-color, #5a5a5a);
  position: relative;
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid var(--settings-border-color);
}

.settings-grid td {
  width: 50%;
  text-align: center;
  vertical-align: middle;
  padding: 12px 10px;
  border-bottom: 1px solid var(--settings-border-color);
}

.settings-grid tr:last-child td {
  border-bottom: none;
}

.settings-grid::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-0.5px);
  border-left: 1px solid var(--settings-border-color);
  pointer-events: none;
}
</style>
