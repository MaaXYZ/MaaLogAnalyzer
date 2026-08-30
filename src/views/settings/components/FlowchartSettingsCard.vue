<script setup lang="ts">
import { NCard, NRadioButton, NRadioGroup, NSelect, NSwitch, NText } from 'naive-ui'
import type { AppSettings } from '../../../utils/settings'

const props = defineProps<{
  settings: AppSettings
  playbackSpeedOptions: Array<{ label: string; value: number }>
  focusZoomOptions: Array<{ label: string; value: number }>
}>()
</script>

<template>
  <n-card size="small" :bordered="true" style="margin-bottom: 12px">
    <n-text strong style="font-size: 16px; display: block; margin-bottom: 4px">流程图</n-text>
    <n-text depth="3" style="font-size: 12px; display: block; margin-bottom: 12px">
      修改后需点击下方“保存设置”才会应用并持久化；画布工具栏的“忽略未经过节点”开关独立于此处，即时生效
    </n-text>

    <table class="settings-grid" role="presentation">
      <tbody>
        <tr>
          <td>连线方式</td>
          <td>
            <n-radio-group v-model:value="props.settings.flowchartEdgeStyle">
              <n-radio-button value="orthogonal">避障折线</n-radio-button>
              <n-radio-button value="default">平滑曲线</n-radio-button>
            </n-radio-group>
          </td>
        </tr>

        <tr>
          <td>连线流动动画</td>
          <td><n-switch v-model:value="props.settings.flowchartEdgeFlowEnabled" /></td>
        </tr>

        <tr>
          <td>拖动后自动重排</td>
          <td><n-switch v-model:value="props.settings.flowchartRelayoutAfterDrag" /></td>
        </tr>

        <tr>
          <td>忽略未经过节点</td>
          <td><n-switch v-model:value="props.settings.flowchartIgnoreUnexecutedNodes" /></td>
        </tr>

        <tr>
          <td>回放速度</td>
          <td>
            <n-select
              v-model:value="props.settings.flowchartPlaybackIntervalMs"
              :options="props.playbackSpeedOptions"
              class="settings-control"
            />
          </td>
        </tr>

        <tr>
          <td>聚焦缩放</td>
          <td>
            <n-select
              v-model:value="props.settings.flowchartFocusZoom"
              :options="props.focusZoomOptions"
              class="settings-control"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </n-card>
</template>

<style scoped src="./settingsGrid.css"></style>
