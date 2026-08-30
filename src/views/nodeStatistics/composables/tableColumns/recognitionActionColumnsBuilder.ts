import type { DataTableColumns } from 'naive-ui'
import type { RecognitionActionStatistics } from '@windsland52/maa-log-parser/node-statistics'
import { formatDuration } from '../../../../utils/formatDuration'
import { renderSuccessRateProgress } from './renderers'

export const buildRecognitionActionColumns = (
  isMobile: boolean,
): DataTableColumns<RecognitionActionStatistics> => {
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
        title: '识别耗时',
        key: 'avgRecognitionDuration',
        width: 90,
        align: 'right',
        sorter: (a, b) => a.avgRecognitionDuration - b.avgRecognitionDuration,
        render: (row) => row.recognitionCount > 0 ? formatDuration(row.avgRecognitionDuration) : '-',
      },
      {
        title: '动作耗时',
        key: 'avgActionDuration',
        width: 90,
        align: 'right',
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.avgActionDuration - b.avgActionDuration,
        render: (row) => row.actionCount > 0 ? formatDuration(row.avgActionDuration) : '-',
      },
    ]
  }

  return [
    {
      title: '节点名称',
      key: 'name',
      width: 200,
      ellipsis: { tooltip: true },
      render: (row) => row.name,
    },
    {
      title: '执行次数',
      key: 'count',
      width: 90,
      align: 'center',
      sorter: (a, b) => a.count - b.count,
      render: (row) => row.count,
    },
    {
      title: '平均识别尝试',
      key: 'avgRecognitionAttempts',
      width: 110,
      align: 'center',
      sorter: (a, b) => a.avgRecognitionAttempts - b.avgRecognitionAttempts,
      render: (row) => row.avgRecognitionAttempts.toFixed(1),
    },
    {
      title: '平均识别耗时',
      key: 'avgRecognitionDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.avgRecognitionDuration - b.avgRecognitionDuration,
      render: (row) => row.recognitionCount > 0 ? formatDuration(row.avgRecognitionDuration) : '-',
    },
    {
      title: '最大识别耗时',
      key: 'maxRecognitionDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.maxRecognitionDuration - b.maxRecognitionDuration,
      render: (row) => row.recognitionCount > 0 ? formatDuration(row.maxRecognitionDuration) : '-',
    },
    {
      title: 'P95 识别耗时',
      key: 'p95RecognitionDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.p95RecognitionDuration - b.p95RecognitionDuration,
      render: (row) => row.recognitionCount > 0 ? formatDuration(row.p95RecognitionDuration) : '-',
    },
    {
      title: '平均动作耗时',
      key: 'avgActionDuration',
      width: 120,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.avgActionDuration - b.avgActionDuration,
      render: (row) => row.actionCount > 0 ? formatDuration(row.avgActionDuration) : '-',
    },
    {
      title: '最大动作耗时',
      key: 'maxActionDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.maxActionDuration - b.maxActionDuration,
      render: (row) => row.actionCount > 0 ? formatDuration(row.maxActionDuration) : '-',
    },
    {
      title: 'P95 动作耗时',
      key: 'p95ActionDuration',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.p95ActionDuration - b.p95ActionDuration,
      render: (row) => row.actionCount > 0 ? formatDuration(row.p95ActionDuration) : '-',
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
      title: '首次通过率',
      key: 'firstTrySuccessRate',
      width: 110,
      align: 'center',
      sorter: (a, b) => a.firstTrySuccessRate - b.firstTrySuccessRate,
      render: (row) => `${row.firstTrySuccessRate.toFixed(1)}%`,
    },
    {
      title: '失败占比',
      key: 'failContribution',
      width: 100,
      align: 'center',
      sorter: (a, b) => a.failContribution - b.failContribution,
      render: (row) => `${row.failContribution.toFixed(1)}%`,
    },
  ]
}
