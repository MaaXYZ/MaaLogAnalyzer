<script setup lang="ts">
import {
  NCard,
  NRadioButton,
  NRadioGroup,
  NSwitch,
  NText,
} from 'naive-ui'
import type { AppSettings } from '../../../utils/settings'

const props = defineProps<{
  settings: AppSettings
}>()
</script>

<template>
  <n-card size="small" :bordered="true" style="margin-bottom: 12px">
    <n-text strong style="font-size: 16px; display: block; margin-bottom: 16px">日志分析</n-text>

    <table class="settings-grid" role="presentation">
      <tbody>
        <tr>
          <td>节点显示模式</td>
          <td>
            <n-radio-group v-model:value="props.settings.displayMode">
              <n-radio-button value="detailed">详细</n-radio-button>
              <n-radio-button value="compact">紧凑</n-radio-button>
              <n-radio-button value="tree">树形</n-radio-button>
            </n-radio-group>
          </td>
        </tr>

        <tr v-if="props.settings.displayMode === 'detailed' || props.settings.displayMode === 'tree'">
          <td>默认折叠根部识别列表</td>
          <td><n-switch v-model:value="props.settings.defaultCollapseRecognition" /></td>
        </tr>

        <tr v-if="props.settings.displayMode === 'detailed' || props.settings.displayMode === 'tree'">
          <td>默认折叠嵌套识别节点</td>
          <td><n-switch v-model:value="props.settings.defaultCollapseNestedRecognition" /></td>
        </tr>

        <tr v-if="props.settings.displayMode === 'detailed' || props.settings.displayMode === 'tree'">
          <td>默认折叠嵌套动作节点</td>
          <td><n-switch v-model:value="props.settings.defaultCollapseNestedActionNodes" /></td>
        </tr>

        <tr>
          <td>默认展开原始 JSON 数据</td>
          <td><n-switch v-model:value="props.settings.defaultExpandRawJson" /></td>
        </tr>
      </tbody>
    </table>
  </n-card>
</template>

<style scoped src="./settingsGrid.css"></style>
