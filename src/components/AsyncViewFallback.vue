<script setup lang="ts">
import { NButton, NFlex, NIcon, NText } from 'naive-ui'
import { ExclamationCircleOutlined, ReloadOutlined } from '@vicons/antd'

const props = defineProps<{
  /** 面板名（「文本搜索」等），用于告诉用户是哪一块没加载出来 */
  label: string
  retry?: () => void
}>()

const reloadPage = () => {
  window.location.reload()
}
</script>

<template>
  <!-- 懒加载面板拿不到 chunk 时的兜底。
       真实场景：部署或本地重建之后，页面还停留在旧版本，切到未加载过的面板会去拉已经
       被删掉的 chunk 文件 -> 404。以前这种情况整块区域是纯空白，用户只能疑惑地反复点。
       现在明确说清楚原因，并给「重试」（文件可能只是临时不可达）与「重新加载页面」（自愈）。 -->
  <div class="async-view-fallback">
    <n-icon :size="30" :depth="3">
      <exclamation-circle-outlined />
    </n-icon>
    <n-text strong style="font-size: 15px">「{{ props.label }}」没能加载出来</n-text>
    <n-text depth="3" class="async-view-fallback__hint">
      这个面板是按需下载的，通常是页面停留在旧版本、对应的文件已经被新构建替换掉了。
    </n-text>
    <n-flex align="center" style="gap: 10px">
      <n-button v-if="props.retry" size="small" @click="props.retry?.()">
        <template #icon>
          <n-icon><reload-outlined /></n-icon>
        </template>
        重试
      </n-button>
      <n-button size="small" secondary @click="reloadPage">重新加载页面</n-button>
    </n-flex>
  </div>
</template>

<style scoped>
.async-view-fallback {
  height: 100%;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  text-align: center;
}

.async-view-fallback__hint {
  font-size: 12px;
  line-height: 1.6;
  max-width: 420px;
}
</style>
