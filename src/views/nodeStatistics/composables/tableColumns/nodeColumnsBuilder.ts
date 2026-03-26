import type { DataTableColumns } from 'naive-ui'
import type { NodeStatistics } from '../../../../utils/nodeStatistics'
import { formatDuration } from '../../../../utils/formatDuration'
import { renderNodeStatusTags, renderSuccessRateProgress } from './renderers'

export const buildNodeColumns = (isMobile: boolean): DataTableColumns<NodeStatistics> => {
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
        sorter: (a, b) => a.count - b.count,
        render: (row) => row.count,
      },
      {
        title: '平均耗时',
        key: 'avgDuration',
        width: 90,
        align: 'right',
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

  return [
    {
      title: '节点名称',
      key: 'name',
      width: 250,
      ellipsis: { tooltip: true },
      render: (row) => row.name,
    },
    {
      title: '执行次数',
      key: 'count',
      width: 100,
      align: 'center',
      sorter: (a, b) => a.count - b.count,
      render: (row) => row.count,
    },
    {
      title: '平均耗时',
      key: 'avgDuration',
      width: 120,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.avgDuration - b.avgDuration,
      render: (row) => formatDuration(row.avgDuration),
    },
    {
      title: '最小耗时',
      key: 'minDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.minDuration - b.minDuration,
      render: (row) => formatDuration(row.minDuration),
    },
    {
      title: '最大耗时',
      key: 'maxDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.maxDuration - b.maxDuration,
      render: (row) => formatDuration(row.maxDuration),
    },
    {
      title: '总耗时',
      key: 'totalDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.totalDuration - b.totalDuration,
      render: (row) => formatDuration(row.totalDuration),
    },
    {
      title: '成功率',
      key: 'successRate',
      width: 150,
      align: 'center',
      sorter: (a, b) => a.successRate - b.successRate,
      render: (row) => renderSuccessRateProgress(row.successRate),
    },
    {
      title: '成功/失败',
      key: 'status',
      width: 120,
      align: 'center',
      render: (row) => renderNodeStatusTags(row.successCount, row.failCount),
    },
  ]
}
