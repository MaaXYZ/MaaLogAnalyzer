import type { DataTableColumns } from 'naive-ui'
import type { NodeStatistics } from '@windsland52/maa-log-parser/node-statistics'
import { formatDuration } from '../../../../utils/formatDuration'
import { renderNodeStatusTags, renderSuccessRateProgress } from './renderers'

/**
 * 窄屏（≤1100，典型是 1024 笔记本窗口）要砍掉的两列。
 *
 * 最小耗时 / P95 耗时的作用是判断分布有多极端，排障第一步几乎不看；而成功率、
 * 成功/失败是必看列。10 列合计 1190px 在 990px 的容器里放不下，被挤出视口的恰好是
 * 最后那几列必看信息，所以先牺牲这两列：砍掉后表宽 940px，1024 视口能整表看完。
 */
const COMPACT_HIDDEN_KEYS = new Set(['minDuration', 'p95Duration'])

export const buildNodeColumns = (
  isMobile: boolean,
  isCompact = false,
): DataTableColumns<NodeStatistics> => {
  if (isMobile) {
    return [
      {
        title: '节点名称',
        key: 'name',
        width: 150,
        ellipsis: { tooltip: true },
        render: (row) => row.name,
      },
      {
        title: '次数',
        key: 'count',
        width: 60,
        align: 'center',
        ellipsis: { tooltip: true },
        sorter: (a, b) => a.count - b.count,
        render: (row) => row.count,
      },
      {
        title: '平均耗时',
        key: 'avgDuration',
        width: 90,
        align: 'right',
        ellipsis: { tooltip: true },
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.avgDuration - b.avgDuration,
        render: (row) => formatDuration(row.avgDuration),
      },
      {
        title: '成功率',
        key: 'successRate',
        width: 80,
        align: 'center',
        sorter: (a, b) => a.successRate - b.successRate,
        render: (row) => `${row.successRate.toFixed(0)}%`,
      },
    ]
  }

  const columns: DataTableColumns<NodeStatistics> = [
    {
      title: '节点名称',
      key: 'name',
      // 窄屏把节点名收窄 50px 换取成功率列进视口：名字本来就靠 ellipsis + tooltip 读全。
      width: isCompact ? 200 : 250,
      ellipsis: { tooltip: true },
      render: (row) => row.name,
    },
    {
      title: '执行次数',
      key: 'count',
      width: 100,
      align: 'center',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.count - b.count,
      render: (row) => row.count,
    },
    {
      title: '平均耗时',
      key: 'avgDuration',
      width: 100,
      align: 'right',
      ellipsis: { tooltip: true },
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.avgDuration - b.avgDuration,
      render: (row) => formatDuration(row.avgDuration),
    },
    {
      title: '最小耗时',
      key: 'minDuration',
      width: 100,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.minDuration - b.minDuration,
      render: (row) => formatDuration(row.minDuration),
    },
    {
      title: '最大耗时',
      key: 'maxDuration',
      width: 100,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.maxDuration - b.maxDuration,
      render: (row) => formatDuration(row.maxDuration),
    },
    {
      title: 'P95 耗时',
      key: 'p95Duration',
      width: 100,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.p95Duration - b.p95Duration,
      render: (row) => formatDuration(row.p95Duration),
    },
    {
      title: '总耗时',
      key: 'totalDuration',
      width: 100,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.totalDuration - b.totalDuration,
      render: (row) => formatDuration(row.totalDuration),
    },
    {
      title: '成功率',
      key: 'successRate',
      width: 120,
      align: 'center',
      sorter: (a, b) => a.successRate - b.successRate,
      render: (row) => renderSuccessRateProgress(row.successRate),
    },
    {
      title: '失败占比',
      key: 'failContribution',
      width: 100,
      align: 'center',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.failContribution - b.failContribution,
      render: (row) => `${row.failContribution.toFixed(1)}%`,
    },
    {
      title: '成功/失败',
      key: 'status',
      width: 120,
      align: 'center',
      render: (row) => renderNodeStatusTags(row.successCount, row.failCount),
    },
  ]

  if (!isCompact) return columns
  return columns.filter(
    (column) => !('key' in column && COMPACT_HIDDEN_KEYS.has(String(column.key))),
  )
}
