<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { NCard, NDataTable, NText } from 'naive-ui'
import NodeStatisticsEmptyState from './NodeStatisticsEmptyState.vue'

const props = defineProps<{
  columns: DataTableColumns<any>
  statistics: any[]
  panelTitle: string
  effectiveTasksLength: number
  // 列口径提示（例如 Wait Freezes 的「重复等待 / 截图」常年为 0 是正常的）
  panelHint?: string
  // 空表时说明「为什么空」，避免用户把「这份日志没有这类记录」当成解析失败
  emptyTitle?: string
  emptyHint?: string
}>()

// 让表格按列宽总宽度开启横向滚动，避免右侧列溢出卡片/面板边界。
const tableScrollX = computed(() => {
  const total = props.columns.reduce((sum, column) => {
    const width = typeof column.width === 'number' ? column.width : 0
    return sum + width
  }, 0)
  return total > 0 ? total : undefined
})

/**
 * 表格虚拟滚动。
 *
 * 行数随日志规模线性增长（5.8MB 日志：node 表 51 行、识别动作 50 行），而 naive 的
 * DataTable 默认把每行每列都真实渲染：一次子标签切换要重建 500–600 个单元格、约 2300 个
 * DOM 节点，实测约 0.9s 主线程占用 —— 这就是切标签卡顿的来源（不是统计计算）。
 * 开启虚拟滚动后只渲染视口内的行，切换代价与总行数解耦。
 *
 * 虚拟滚动需要 px 高度，而这张表原来是被内容撑开的（页面级滚动，实测容器 2048px）。
 * 所以这里按「表格顶部到视口底部的剩余高度」封顶，让表格自己成为滚动区：
 * 不封顶的话 max-height 等于内容高度，等于没虚拟化。
 */
const bodyRef = ref<HTMLElement | null>(null)
// 上下限：低于 320px 看不清一张统计表；高于 720px 会在高屏上又变成"整页滚动"
const MIN_TABLE_HEIGHT = 320
const MAX_TABLE_HEIGHT = 720
const tableViewportHeight = ref(MIN_TABLE_HEIGHT)
let resizeObserver: ResizeObserver | null = null

const syncViewportHeight = () => {
  const el = bodyRef.value
  if (!el) return
  const top = el.getBoundingClientRect().top
  const available = Math.floor(window.innerHeight - top - 16)
  tableViewportHeight.value = Math.max(MIN_TABLE_HEIGHT, Math.min(available, MAX_TABLE_HEIGHT))
}

onMounted(() => {
  syncViewportHeight()
  window.addEventListener('resize', syncViewportHeight)
  if (typeof ResizeObserver === 'undefined') return
  // 面板位置会随汇总卡、搜索筛选变化而移动，盯住它比只监听 resize 更可靠
  resizeObserver = new ResizeObserver(syncViewportHeight)
  resizeObserver.observe(document.body)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportHeight)
  resizeObserver?.disconnect()
  resizeObserver = null
})

// 行 key 用节点名：切标签时同一节点的行身份不变，虚拟列表不会整片重建
const rowKey = (row: { name?: string }) => row.name ?? ''
</script>

<template>
  <n-card
    class="statistics-data-card"
    size="small"
    :bordered="false"
    content-style="padding: 0 0 8px 0; flex: 1; min-height: 0; display: flex; flex-direction: column"
  >
    <template #header>
      <div class="data-panel-header">
        <div class="data-panel-title">{{ props.panelTitle }}</div>
        <n-text depth="3" class="data-panel-meta">
          {{
            props.statistics.length > 0
              ? `共 ${props.statistics.length} 项`
              : props.panelHint || '按当前筛选展示结果'
          }}
        </n-text>
      </div>
    </template>

    <div ref="bodyRef" class="data-panel-body" data-tour="statistics-table">
      <n-data-table
        v-if="props.statistics.length > 0"
        :columns="props.columns"
        :data="props.statistics"
        :scroll-x="tableScrollX"
        :max-height="tableViewportHeight"
        virtual-scroll
        :row-key="rowKey"
        :bordered="false"
        :single-line="false"
        size="small"
        striped
      />

      <node-statistics-empty-state v-else-if="props.effectiveTasksLength === 0" />

      <!-- 没有数据时仍然渲染表头：光一个「暂无数据」图标，用户分不清是
           「这类记录本来就没有」还是「页面坏了」，也看不到这张表有哪些列 -->
      <n-data-table
        v-else
        :columns="props.columns"
        :data="[]"
        :scroll-x="tableScrollX"
        :bordered="false"
        :single-line="false"
        size="small"
      >
        <template #empty>
          <div class="data-panel-empty">
            <div class="data-panel-empty__title">{{ props.emptyTitle || '暂无数据' }}</div>
            <div v-if="props.emptyHint" class="data-panel-empty__hint">{{ props.emptyHint }}</div>
          </div>
        </template>
      </n-data-table>
    </div>
  </n-card>
</template>

<style scoped>
.statistics-data-card {
  width: 100%;
  min-height: 0;
}

.data-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.data-panel-title {
  font-size: 16px;
  font-weight: 700;
}

.data-panel-meta {
  font-size: 12px;
}

.data-panel-body {
  flex: 1;
  min-height: 0;
  overflow: visible;
}

/* 空表说明：表头仍在，下面这一段解释「为什么空、怎么才能有数据」 */
.data-panel-empty {
  padding: 40px 16px;
  text-align: center;
}

.data-panel-empty__title {
  font-size: 14px;
  color: var(--n-text-color-2, inherit);
}

.data-panel-empty__hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--n-text-color-3, inherit);
  max-width: 560px;
  margin-left: auto;
  margin-right: auto;
}

/*
 * 横向滚动条常显。
 *
 * naive-ui 的 NScrollbar 把原生滚动条藏了起来（scrollbar-width:none + ::-webkit-scrollbar 0 宽），
 * 只在鼠标移入时才画出自己的 rail。统计表 10 列在 1024 视口下必然横向溢出，
 * 不 hover 就完全看不到「右边还有成功率 / 成功·失败」，用户会以为这份日志没有失败数据。
 *
 * 做法：把原生滚动条改回常显的细条（两个轴都常显，滚动能力本来就该一直可见），
 * 并把 naive 自绘的 rail 隐藏掉，避免 hover 时两条滚动条叠在同一个位置。
 * scrollbar-width/-color 是标准属性（Chromium 121+/Firefox 生效），
 * 下面 ::-webkit-scrollbar 规则供不支持标准属性的旧版 Chromium 兜底。
 */
.data-panel-body :deep(.n-scrollbar-container) {
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(144, 147, 153, 0.5) transparent;
}

.data-panel-body :deep(.n-scrollbar-rail) {
  display: none;
}

.data-panel-body :deep(.n-scrollbar-container::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

.data-panel-body :deep(.n-scrollbar-container::-webkit-scrollbar-thumb) {
  border-radius: 5px;
  background-color: rgba(144, 147, 153, 0.5);
}
</style>
