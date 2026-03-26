import type { RecognitionActionStatistics } from '../../../../utils/nodeStatistics'
import { formatDuration } from '../../../../utils/formatDuration'
import type { RecognitionActionChartDimension } from './dimensions'
import { buildPieBaseOption } from './basePie'

export const buildRecognitionActionChartOption = (
  source: RecognitionActionStatistics[],
  dimension: RecognitionActionChartDimension,
) => {
  if (source.length === 0) return null

  let title = ''
  let formatter: string | ((params: any) => string) = ''
  let sortFn: (a: RecognitionActionStatistics, b: RecognitionActionStatistics) => number
  let valueFn: (item: RecognitionActionStatistics) => number
  let filterFn: (item: RecognitionActionStatistics) => boolean = () => true

  switch (dimension) {
    case 'avgRecognitionDuration':
      title = '平均识别耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.avgRecognitionDuration - a.avgRecognitionDuration
      valueFn = (item) => item.avgRecognitionDuration
      filterFn = (item) => item.recognitionCount > 0
      break
    case 'maxRecognitionDuration':
      title = '最大识别耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.maxRecognitionDuration - a.maxRecognitionDuration
      valueFn = (item) => item.maxRecognitionDuration
      filterFn = (item) => item.recognitionCount > 0
      break
    case 'avgActionDuration':
      title = '平均动作耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.avgActionDuration - a.avgActionDuration
      valueFn = (item) => item.avgActionDuration
      filterFn = (item) => item.actionCount > 0
      break
    case 'maxActionDuration':
      title = '最大动作耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.maxActionDuration - a.maxActionDuration
      valueFn = (item) => item.maxActionDuration
      filterFn = (item) => item.actionCount > 0
      break
    case 'avgRecognitionAttempts':
      title = '平均识别尝试次数分布 (Top 10)'
      formatter = '{b}: {c} 次 ({d}%)'
      sortFn = (a, b) => b.avgRecognitionAttempts - a.avgRecognitionAttempts
      valueFn = (item) => item.avgRecognitionAttempts
      break
  }

  const top10 = source
    .slice()
    .filter(filterFn)
    .sort(sortFn)
    .slice(0, 10)

  if (top10.length === 0) return null

  return buildPieBaseOption(
    title,
    formatter,
    top10.map((item) => ({ name: item.name, value: valueFn(item) })),
    (params: any) => {
      if (dimension === 'avgRecognitionAttempts') {
        return `${params.name}\n${params.value.toFixed(1)} 次`
      }
      return `${params.name}\n${formatDuration(params.value)}`
    },
  )
}
