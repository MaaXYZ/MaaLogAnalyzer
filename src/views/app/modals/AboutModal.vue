<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NFlex, NCard, NText, NTag, NButton, NIcon } from 'naive-ui'
import { GithubOutlined } from '@vicons/antd'

interface Props {
  show: boolean
  width: string
  isVscodeLaunchEmbed: boolean
  appEmbedMode: string
  bridgeEnabled: boolean
  tutorialLoading: boolean
  version: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'start-tutorial': []
}>()

const showModel = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
})
</script>

<template>
  <n-modal
    v-model:show="showModel"
    preset="card"
    title="关于"
    :style="{ width: props.width }"
    :bordered="false"
  >
    <n-flex vertical style="gap: 14px">
      <n-card size="small" :bordered="true">
        <n-flex vertical style="gap: 10px">
          <n-text strong style="font-size: 18px">MAA 日志分析工具 | MaaLogAnalyzer</n-text>
          <n-text depth="3">MaaFramework 日志分析与可视化工具，觉得好用可以点点 star！</n-text>
        </n-flex>
      </n-card>

      <n-card size="small" :bordered="true">
        <n-flex vertical style="gap: 10px">
          <n-text strong>项目与技术栈</n-text>
          <n-flex wrap style="gap: 8px">
            <n-tag type="info">Vue 3</n-tag>
            <n-tag type="info">TypeScript</n-tag>
            <n-tag type="info">Naive UI</n-tag>
            <n-tag type="info">Vite</n-tag>
            <n-tag v-if="!props.isVscodeLaunchEmbed" type="info">Tauri</n-tag>
            <n-tag v-else type="success">VS Code Webview</n-tag>
          </n-flex>
          <n-button
            text
            tag="a"
            href="https://github.com/MaaXYZ/MaaLogAnalyzer"
            target="_blank"
            type="primary"
            style="padding: 0; justify-content: flex-start"
          >
            <template #icon>
              <n-icon><github-outlined /></n-icon>
            </template>
            GitHub: Maa Log Analyzer
          </n-button>
        </n-flex>
      </n-card>

      <n-card size="small" :bordered="true">
        <n-flex vertical style="gap: 10px">
          <n-text strong>快速开始</n-text>
          <n-text depth="3" style="font-size: 13px">首次使用建议先跑一遍新手教程，了解大致功能。</n-text>
          <n-button data-tour="about-start-tutorial" type="primary" :loading="props.tutorialLoading" @click="emit('start-tutorial')">
            开始新手教程
          </n-button>
        </n-flex>
      </n-card>

      <n-card v-if="props.isVscodeLaunchEmbed" size="small" :bordered="true">
        <n-flex vertical style="gap: 10px">
          <n-text strong>VS Code 嵌入模式</n-text>
          <n-text depth="3" style="font-size: 13px">
            当前运行在 VS Code iframe 中，部分能力由 Support 宿主接管。
          </n-text>
          <n-flex wrap style="gap: 8px">
            <n-tag size="small" type="info">Embed: {{ props.appEmbedMode }}</n-tag>
            <n-tag size="small" :type="props.bridgeEnabled ? 'success' : 'warning'">
              Bridge: {{ props.bridgeEnabled ? '已启用' : '未启用' }}
            </n-tag>
          </n-flex>
        </n-flex>
      </n-card>

      <n-flex justify="space-between" align="center" style="padding: 0 4px">
        <n-text depth="3" style="font-size: 12px">Version {{ props.version }}</n-text>
        <n-text depth="3" style="font-size: 12px">© 2025 MaaXYZ</n-text>
      </n-flex>
    </n-flex>
  </n-modal>
</template>
