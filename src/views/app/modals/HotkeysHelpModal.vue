<script setup lang="ts">
import { ref } from 'vue'
import { NModal, NFlex, NText } from 'naive-ui'
import { useHotkeys } from '../../../composables/useHotkeys'

interface HotkeyHelpItem {
  keys: string[]
  label: string
}

interface HotkeyHelpGroup {
  title: string
  items: HotkeyHelpItem[]
}

const groups: HotkeyHelpGroup[] = [
  {
    title: '通用',
    items: [
      { keys: ['?'], label: '打开本帮助（Esc 关闭）' },
      { keys: ['1', '…', '5'], label: '切换视图（顺序同顶栏标签）' },
      { keys: ['Esc'], label: '关闭浮层 / 清除筛选与搜索' },
    ],
  },
  {
    title: '日志分析',
    items: [
      { keys: ['j', '↓'], label: '下一个节点' },
      { keys: ['k', '↑'], label: '上一个节点' },
      { keys: ['f'], label: '只看失败 / 仅异常' },
      { keys: ['n', 'Shift+n'], label: '下一个 / 上一个搜索命中' },
      { keys: ['Enter', 'Shift+Enter'], label: '在节点搜索框里跳下一处 / 上一处' },
    ],
  },
  {
    title: '文本搜索',
    items: [{ keys: ['n', 'Shift+n'], label: '下一个 / 上一个命中' }],
  },
  {
    title: '流程图',
    items: [{ keys: ['Esc'], label: '关闭节点弹窗' }],
  },
]

const show = ref(false)

// ? 打开/关闭。多数键盘布局上 ? 是 Shift+/，但保留一个不按 Shift 的绑定，
// 让以 ? 为直接键位的布局也能用；输入框里打 ? 时正常输入（不抢键）。
useHotkeys({
  bindings: () => [
    { key: '?', shift: true, run: () => (show.value = !show.value) },
    { key: '?', shift: false, run: () => (show.value = !show.value) },
  ],
})
</script>

<template>
  <n-modal
    v-model:show="show"
    preset="card"
    title="快捷键"
    style="width: 460px; max-width: 92vw"
    :bordered="false"
  >
    <n-flex vertical style="gap: 14px">
      <n-text depth="3" style="font-size: 12px">
        j / k 走"最后操作过的那个列表"：在节点导航里按导航列表顺序，否则按时间线顺序。
      </n-text>
      <div v-for="group in groups" :key="group.title" class="hotkey-group">
        <div class="hotkey-group-title">{{ group.title }}</div>
        <div v-for="item in group.items" :key="item.label" class="hotkey-row">
          <span class="hotkey-keys">
            <template v-for="(key, index) in item.keys" :key="key">
              <span class="hotkey-key">{{ key }}</span>
              <span v-if="index < item.keys.length - 1" class="hotkey-sep">/</span>
            </template>
          </span>
          <span class="hotkey-label">{{ item.label }}</span>
        </div>
      </div>
    </n-flex>
  </n-modal>
</template>

<style scoped>
.hotkey-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hotkey-group-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
  margin-bottom: 2px;
}

.hotkey-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.hotkey-keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 128px;
}

.hotkey-key {
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 16px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.18);
  border: 1px solid rgba(128, 128, 128, 0.3);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.hotkey-sep {
  font-size: 11px;
  opacity: 0.45;
}

.hotkey-label {
  font-size: 12px;
  opacity: 0.85;
}
</style>
