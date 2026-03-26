<script setup lang="ts">
import {
  NCard,
  NFlex,
  NInput,
  NInputNumber,
  NSwitch,
  NText,
} from 'naive-ui'
import type { AiSettings } from '../../../utils/aiSettings'

const props = defineProps<{
  aiSettings: AiSettings
}>()
</script>

<template>
  <n-card size="small" :bordered="true" style="margin-bottom: 12px">
    <n-text strong style="font-size: 16px; display: block; margin-bottom: 16px">AI 基础</n-text>

    <table class="settings-grid" role="presentation">
      <tbody>
        <tr>
          <td>API Base URL</td>
          <td>
            <n-input
              v-model:value="props.aiSettings.baseUrl"
              placeholder="https://api.openai.com/v1"
              style="width: 280px; margin: 0 auto"
            />
          </td>
        </tr>

        <tr>
          <td>模型名称</td>
          <td>
            <n-input
              v-model:value="props.aiSettings.model"
              placeholder="gpt-5.4"
              style="width: 280px; margin: 0 auto"
            />
          </td>
        </tr>

        <tr>
          <td>温度</td>
          <td>
            <n-input-number
              v-model:value="props.aiSettings.temperature"
              :min="0"
              :max="2"
              :step="0.1"
              style="width: 180px; margin: 0 auto"
            />
          </td>
        </tr>

        <tr>
          <td>最大输出 token</td>
          <td>
            <n-flex align="center" justify="center" style="gap: 8px; flex-wrap: wrap">
              <n-input-number
                v-model:value="props.aiSettings.maxTokens"
                :min="256"
                :max="8192"
                :step="64"
                style="width: 180px"
              />
            </n-flex>
          </td>
        </tr>

        <tr>
          <td>自动截断重试（提额）</td>
          <td><n-switch v-model:value="props.aiSettings.maxTokensAuto" /></td>
        </tr>

        <tr>
          <td>注入 Maa 领域知识包</td>
          <td><n-switch v-model:value="props.aiSettings.includeKnowledgePack" /></td>
        </tr>

        <tr>
          <td>注入 [WRN]/[ERR] 信号线</td>
          <td><n-switch v-model:value="props.aiSettings.includeSignalLines" /></td>
        </tr>

        <tr>
          <td>注入选中节点焦点上下文</td>
          <td><n-switch v-model:value="props.aiSettings.includeSelectedNodeFocus" /></td>
        </tr>

        <tr>
          <td>分析请求启用流式</td>
          <td><n-switch v-model:value="props.aiSettings.streamResponse" /></td>
        </tr>
      </tbody>
    </table>
  </n-card>
</template>

<style scoped src="./settingsGrid.css"></style>
