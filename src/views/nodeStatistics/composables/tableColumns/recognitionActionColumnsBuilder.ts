import type { DataTableColumns } from 'naive-ui'
import type { RecognitionActionStatistics } from '@windsland52/maa-log-parser/node-statistics'
import { formatDuration } from '../../../../utils/formatDuration'
import { renderSuccessRateProgress } from './renderers'

/**
 * 窄屏（≤1100）要砍掉的两列：两个 P95 分位耗时。
 *
 * 识别 / 动作表是统计里最宽的一张（12 列 1460px），1024 视口下横向要滑很久才能看到
 * 成功率与首次通过率。P95 和最大耗时回答的是同一个问题（长尾有多长），窄屏留最大耗时即可。
 */
const COMPACT_HIDDEN_KEYS = new Set(['p95RecognitionDuration', 'p95ActionDuration'])

export const buildRecognitionActionColumns = (
  isMobile: boolean,
  isCompact = false,
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
        ellipsis: { tooltip: true },
        sorter: (a, b) => a.count - b.count,
        render: (row) => row.count,
      },
      {
        title: '识别耗时',
        key: 'avgRecognitionDuration',
        width: 90,
        align: 'right',
        ellipsis: { tooltip: true },
        sorter: (a, b) => a.avgRecognitionDuration - b.avgRecognitionDuration,
        render: (row) =>
          row.recognitionCount > 0 ? formatDuration(row.avgRecognitionDuration) : '-',
      },
      {
        title: '动作耗时',
        key: 'avgActionDuration',
        width: 90,
        align: 'right',
        ellipsis: { tooltip: true },
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.avgActionDuration - b.avgActionDuration,
        render: (row) => (row.actionCount > 0 ? formatDuration(row.avgActionDuration) : '-'),
      },
    ]
  }

  const columns: DataTableColumns<RecognitionActionStatistics> = [
    {
      title: '节点名称',
      key: 'name',
      width: isCompact ? 170 : 200,
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
      title: '平均识别尝试',
      key: 'avgRecognitionAttempts',
      width: 110,
      align: 'center',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.avgRecognitionAttempts - b.avgRecognitionAttempts,
      render: (row) => row.avgRecognitionAttempts.toFixed(1),
    },
    {
      title: '平均识别耗时',
      key: 'avgRecognitionDuration',
      width: 120,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.avgRecognitionDuration - b.avgRecognitionDuration,
      render: (row) =>
        row.recognitionCount > 0 ? formatDuration(row.avgRecognitionDuration) : '-',
    },
    {
      title: '最大识别耗时',
      key: 'maxRecognitionDuration',
      width: 120,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.maxRecognitionDuration - b.maxRecognitionDuration,
      render: (row) =>
        row.recognitionCount > 0 ? formatDuration(row.maxRecognitionDuration) : '-',
    },
    {
      title: 'P95 识别耗时',
      key: 'p95RecognitionDuration',
      width: 120,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.p95RecognitionDuration - b.p95RecognitionDuration,
      render: (row) =>
        row.recognitionCount > 0 ? formatDuration(row.p95RecognitionDuration) : '-',
    },
    {
      title: '平均动作耗时',
      key: 'avgActionDuration',
      width: 120,
      align: 'right',
      ellipsis: { tooltip: true },
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.avgActionDuration - b.avgActionDuration,
      render: (row) => (row.actionCount > 0 ? formatDuration(row.avgActionDuration) : '-'),
    },
    {
      title: '最大动作耗时',
      key: 'maxActionDuration',
      width: 120,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.maxActionDuration - b.maxActionDuration,
      render: (row) => (row.actionCount > 0 ? formatDuration(row.maxActionDuration) : '-'),
    },
    {
      title: 'P95 动作耗时',
      key: 'p95ActionDuration',
      width: 120,
      align: 'right',
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.p95ActionDuration - b.p95ActionDuration,
      render: (row) => (row.actionCount > 0 ? formatDuration(row.p95ActionDuration) : '-'),
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
      ellipsis: { tooltip: true },
      sorter: (a, b) => a.firstTrySuccessRate - b.firstTrySuccessRate,
      render: (row) => `${row.firstTrySuccessRate.toFixed(1)}%`,
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
  ]

  if (!isCompact) return columns
  return columns.filter(
    (column) => !('key' in column && COMPACT_HIDDEN_KEYS.has(String(column.key))),
  )
}
