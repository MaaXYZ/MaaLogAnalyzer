import type { DataTableColumns } from 'naive-ui'
import type { WaitFreezeStatistics } from '@windsland52/maa-log-parser/node-statistics'
import { formatDuration } from '../../../../utils/formatDuration'
import { renderSuccessRateProgress } from './renderers'

export const buildWaitFreezeColumns = (
  isMobile: boolean,
  isCompact = false,
): DataTableColumns<WaitFreezeStatistics> => {
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
        title: '重复等待',
        key: 'repeatCount',
        width: 80,
        align: 'center',
        ellipsis: { tooltip: true },
        sorter: (a, b) => a.repeatCount - b.repeatCount,
        render: (row) => row.repeatCount,
      },
      {
        title: '平均耗时',
        key: 'avgElapsed',
        width: 90,
        align: 'right',
        ellipsis: { tooltip: true },
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.avgElapsed - b.avgElapsed,
        render: (row) => formatDuration(row.avgElapsed),
      },
    ]
  }

  // 这张表 8 列合计 940px，1024 视口（容器 990px）本来就能整表放下，
  // 所以窄屏只收窄节点名列，不砍任何指标。
  return [
    {
      title: '节点名称',
      key: 'name',
      width: isCompact ? 180 : 220,
      ellipsis: { tooltip: true },
      render: (row) => row.name,
    },
    {
      title: '执行次数',
      key: 'count',
      width: 90,
      align: 'center',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.count - b.count,
      render: (row) => row.count,
    },
    {
      title: '重复等待',
      key: 'repeatCount',
      width: 100,
      align: 'center',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.repeatCount - b.repeatCount,
      render: (row) => row.repeatCount,
    },
    {
      title: '平均耗时',
      key: 'avgElapsed',
      width: 110,
      align: 'right',
      ellipsis: { tooltip: true },
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.avgElapsed - b.avgElapsed,
      render: (row) => formatDuration(row.avgElapsed),
    },
    {
      title: '最大耗时',
      key: 'maxElapsed',
      width: 110,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.maxElapsed - b.maxElapsed,
      render: (row) => formatDuration(row.maxElapsed),
    },
    {
      title: '成功率',
      key: 'successRate',
      width: 130,
      align: 'center',
      sorter: (a, b) => a.successRate - b.successRate,
      render: (row) => renderSuccessRateProgress(row.successRate),
    },
    {
      title: '关联识别',
      key: 'avgRecoIds',
      width: 100,
      align: 'center',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.avgRecoIds - b.avgRecoIds,
      render: (row) => row.avgRecoIds.toFixed(1),
    },
    {
      title: '截图',
      key: 'imageCount',
      width: 80,
      align: 'center',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.imageCount - b.imageCount,
      render: (row) => row.imageCount,
    },
  ]
}
