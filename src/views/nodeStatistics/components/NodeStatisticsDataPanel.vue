<script setup lang="ts">
import { computed } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { NCard, NDataTable, NEmpty, NText } from 'naive-ui'
import NodeStatisticsEmptyState from './NodeStatisticsEmptyState.vue'

const props = defineProps<{
  columns: DataTableColumns<any>
  statistics: any[]
  panelTitle: string
  effectiveTasksLength: number
}>()

// 让表格按列宽总宽度开启横向滚动，避免右侧列溢出卡片/面板边界。
const tableScrollX = computed(() => {
  const total = props.columns.reduce((sum, column) => {
    const width = typeof column.width === 'number' ? column.width : 0
    return sum + width
  }, 0)
  return total > 0 ? total : undefined
})
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
            props.statistics.length > 0 ? `共 ${props.statistics.length} 项` : '按当前筛选展示结果'
          }}
        </n-text>
      </div>
    </template>

    <div class="data-panel-body" data-tour="statistics-table">
      <n-data-table
        v-if="props.statistics.length > 0"
        :columns="props.columns"
        :data="props.statistics"
        :scroll-x="tableScrollX"
        :bordered="false"
        :single-line="false"
        size="small"
        striped
      />

      <node-statistics-empty-state v-else-if="props.effectiveTasksLength === 0" />

      <n-empty v-else description="暂无数据" style="margin-top: 60px" />
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
