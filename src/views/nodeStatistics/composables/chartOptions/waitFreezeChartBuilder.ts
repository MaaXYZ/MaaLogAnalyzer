import type { WaitFreezeStatistics } from '@windsland52/maa-log-parser/node-statistics'
import { formatDuration } from '../../../../utils/formatDuration'
import type { WaitFreezeChartDimension } from './dimensions'
import { buildBarBaseOption } from './baseBar'

export const buildWaitFreezeChartOption = (
  source: WaitFreezeStatistics[],
  dimension: WaitFreezeChartDimension,
) => {
  if (source.length === 0) return null

  let title = ''
  let tooltipFormatter: (params: any) => string
  let valueFormatter: (value: number) => string
  let sortFn: (a: WaitFreezeStatistics, b: WaitFreezeStatistics) => number
  let valueFn: (item: WaitFreezeStatistics) => number

  switch (dimension) {
    case 'count':
      title = 'Wait Freezes 次数排行（Top 10）'
      tooltipFormatter = (params: any) => `${params.name}<br />等待次数：${params.value} 次`
      valueFormatter = (value: number) => `${value} 次`
      sortFn = (a, b) => b.count - a.count
      valueFn = (item) => item.count
      break
    case 'repeatCount':
      title = '重复等待次数排行（Top 10）'
      tooltipFormatter = (params: any) => `${params.name}<br />重复等待：${params.value} 次`
      valueFormatter = (value: number) => `${value} 次`
      sortFn = (a, b) => b.repeatCount - a.repeatCount || b.avgElapsed - a.avgElapsed
      valueFn = (item) => item.repeatCount
      break
    case 'avgElapsed':
      title = '平均等待耗时排行（Top 10）'
      tooltipFormatter = (params: any) => `${params.name}<br />平均等待耗时：${formatDuration(params.value)}`
      valueFormatter = (value: number) => formatDuration(value)
      sortFn = (a, b) => b.avgElapsed - a.avgElapsed
      valueFn = (item) => item.avgElapsed
      break
    case 'maxElapsed':
      title = '最大等待耗时排行（Top 10）'
      tooltipFormatter = (params: any) => `${params.name}<br />最大等待耗时：${formatDuration(params.value)}`
      valueFormatter = (value: number) => formatDuration(value)
      sortFn = (a, b) => b.maxElapsed - a.maxElapsed
      valueFn = (item) => item.maxElapsed
      break
    case 'successRate':
      title = 'Wait Freezes 成功率排行（Top 10）'
      tooltipFormatter = (params: any) => `${params.name}<br />成功率：${params.value.toFixed(1)}%`
      valueFormatter = (value: number) => `${value.toFixed(1)}%`
      sortFn = (a, b) => b.successRate - a.successRate || b.repeatCount - a.repeatCount
      valueFn = (item) => item.successRate
      break
  }

  const top10 = source
    .slice()
    .sort(sortFn)
    .slice(0, 10)

  return buildBarBaseOption(
    title,
    top10.map((item) => ({ name: item.name, value: valueFn(item) })),
    tooltipFormatter,
    valueFormatter,
  )
}
