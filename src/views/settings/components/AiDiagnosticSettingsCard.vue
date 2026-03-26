<script setup lang="ts">
import {
  NCard,
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
    <n-text strong style="font-size: 16px; display: block; margin-bottom: 16px">AI 诊断输出</n-text>

    <table class="settings-grid" role="presentation">
      <tbody>
        <tr>
          <td>截断后自动精简重试</td>
          <td><n-switch v-model:value="props.aiSettings.truncateAutoRetryEnabled" /></td>
        </tr>

        <tr>
          <td>精简答案长度上限</td>
          <td>
            <n-input-number
              v-model:value="props.aiSettings.conciseAnswerMaxChars"
              :min="800"
              :max="5000"
              :step="100"
              style="width: 180px; margin: 0 auto"
            />
          </td>
        </tr>

        <tr>
          <td>根因候选条数上限</td>
          <td>
            <n-input-number
              v-model:value="props.aiSettings.conciseMaxRootCauses"
              :min="2"
              :max="6"
              :step="1"
              style="width: 180px; margin: 0 auto"
            />
          </td>
        </tr>

        <tr>
          <td>证据条数上限</td>
          <td>
            <n-input-number
              v-model:value="props.aiSettings.conciseMaxEvidence"
              :min="3"
              :max="12"
              :step="1"
              style="width: 180px; margin: 0 auto"
            />
          </td>
        </tr>

        <tr>
          <td>排查步骤条数</td>
          <td>
            <n-input-number
              v-model:value="props.aiSettings.conciseFixedSteps"
              :min="3"
              :max="8"
              :step="1"
              style="width: 180px; margin: 0 auto"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </n-card>
</template>

<style scoped src="./settingsGrid.css"></style>
