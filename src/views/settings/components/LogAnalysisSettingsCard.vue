<script setup lang="ts">
import { NCard, NRadioButton, NRadioGroup, NSwitch, NText } from 'naive-ui'
import type { AppSettings } from '../../../utils/settings'

const props = defineProps<{
  settings: AppSettings
}>()
</script>

<template>
  <n-card size="small" :bordered="true" style="margin-bottom: 12px">
    <n-text strong style="font-size: 16px; display: block; margin-bottom: 4px">日志分析</n-text>
    <n-text depth="3" style="font-size: 12px; display: block; margin-bottom: 12px">
      修改后需点击下方“保存设置”才会应用并持久化；打开设置面板会还原为已保存的值
    </n-text>

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

        <tr>
          <td
            title="在节点卡片中同时显示未命中任何目标的识别项，便于排查流水线为什么没走到预期分支"
          >
            显示未识别节点
          </td>
          <td><n-switch v-model:value="props.settings.showNotRecognizedNodes" /></td>
        </tr>

        <tr
          v-if="props.settings.displayMode === 'detailed' || props.settings.displayMode === 'tree'"
        >
          <td title="新加载日志时，节点卡片的 Recognition 区块默认收起，点击展开">
            默认折叠根部识别列表
          </td>
          <td><n-switch v-model:value="props.settings.defaultCollapseRecognition" /></td>
        </tr>

        <tr
          v-if="props.settings.displayMode === 'detailed' || props.settings.displayMode === 'tree'"
        >
          <td title="新加载日志时，节点卡片的 Action 区块默认收起，点击展开">
            默认折叠根部动作列表
          </td>
          <td><n-switch v-model:value="props.settings.defaultCollapseRootActionList" /></td>
        </tr>

        <tr
          v-if="props.settings.displayMode === 'detailed' || props.settings.displayMode === 'tree'"
        >
          <td title="识别批次内嵌套的子识别项（多轮尝试）默认收起">默认折叠嵌套识别节点</td>
          <td><n-switch v-model:value="props.settings.defaultCollapseNestedRecognition" /></td>
        </tr>

        <tr
          v-if="props.settings.displayMode === 'detailed' || props.settings.displayMode === 'tree'"
        >
          <td title="动作详情内嵌套的子动作节点默认收起">默认折叠嵌套动作节点</td>
          <td><n-switch v-model:value="props.settings.defaultCollapseNestedActionNodes" /></td>
        </tr>

        <tr>
          <td title="详情面板中“原始节点数据 / 原始识别数据”默认展开">默认展开原始 JSON 数据</td>
          <td><n-switch v-model:value="props.settings.defaultExpandRawJson" /></td>
        </tr>
      </tbody>
    </table>
  </n-card>
</template>

<style scoped src="./settingsGrid.css"></style>
