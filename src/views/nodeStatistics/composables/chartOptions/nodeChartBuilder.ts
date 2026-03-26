import type { NodeStatistics } from '../../../../utils/nodeStatistics'
import { formatDuration } from '../../../../utils/formatDuration'
import type { NodeChartDimension } from './dimensions'
import { buildPieBaseOption } from './basePie'

export const buildNodeChartOption = (
  source: NodeStatistics[],
  dimension: NodeChartDimension,
) => {
  if (source.length === 0) return null

  let title = ''
  let formatter: string | ((params: any) => string) = ''
  let sortFn: (a: NodeStatistics, b: NodeStatistics) => number
  let valueFn: (item: NodeStatistics) => number

  switch (dimension) {
    case 'count':
      title = '节点执行次数分布 (Top 10)'
      formatter = '{b}: {c} 次 ({d}%)'
      sortFn = (a, b) => b.count - a.count
      valueFn = (item) => item.count
      break
    case 'totalDuration':
      title = '节点总耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.totalDuration - a.totalDuration
      valueFn = (item) => item.totalDuration
      break
    case 'avgDuration':
      title = '节点平均耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.avgDuration - a.avgDuration
      valueFn = (item) => item.avgDuration
      break
    case 'maxDuration':
      title = '节点最大耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.maxDuration - a.maxDuration
      valueFn = (item) => item.maxDuration
      break
  }

  const top10 = source
    .slice()
    .sort(sortFn)
    .slice(0, 10)

  return buildPieBaseOption(
    title,
    formatter,
    top10.map((item) => ({ name: item.name, value: valueFn(item) })),
    (params: any) => {
      if (dimension === 'count') {
        return `${params.name}\n${params.value} 次`
      }
      return `${params.name}\n${formatDuration(params.value)}`
    },
  )
}
