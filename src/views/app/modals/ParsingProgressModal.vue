<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NFlex, NText, NProgress } from 'naive-ui'

interface Props {
  show: boolean
  width: string
  progress: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const showModel = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
})

// 播报粒度按 10% 一档：进度条每 1% 更新一次，如果 1% 播报一条，
// 解析一个大日志会往读屏塞上百条消息，反而把真正要听的内容淹没。
const announcedPercent = computed(() => Math.min(100, Math.floor(props.progress / 10) * 10))
</script>

<template>
  <n-modal
    v-model:show="showModel"
    preset="card"
    title="正在解析日志文件"
    :style="{ width: props.width }"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
  >
    <n-flex vertical style="gap: 20px; padding: 20px 0">
      <n-text style="text-align: center; font-size: 16px"> 解析进度：{{ props.progress }}% </n-text>
      <!-- 视觉隐藏的播报区：可见的那行百分比对读屏不是 live 内容，
           不加这个的话「0→100%」全程静音，用户不知道还要等多久、也不知道已经完成 -->
      <div
        v-if="props.show"
        class="app-visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ announcedPercent >= 100 ? '日志解析完成' : `日志解析进度 ${announcedPercent}%` }}
      </div>
      <n-progress
        type="line"
        :percentage="props.progress"
        :show-indicator="false"
        :height="24"
        status="success"
      />
      <n-text depth="3" style="text-align: center; font-size: 13px">
        正在分块处理日志，请稍候...
      </n-text>
    </n-flex>
  </n-modal>
</template>
