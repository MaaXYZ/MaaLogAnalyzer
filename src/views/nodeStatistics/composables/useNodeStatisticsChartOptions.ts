import { computed, type Ref } from 'vue'
import type {
  NodeStatistics,
  RecognitionActionStatistics,
} from '../../../utils/nodeStatistics'
import { adaptChartForMobile } from './chartOptions/basePie'
import {
  buildNodeChartOption,
} from './chartOptions/nodeChartBuilder'
import {
  buildRecognitionActionChartOption,
} from './chartOptions/recognitionActionChartBuilder'
import type {
  NodeChartDimension,
  RecognitionActionChartDimension,
} from './chartOptions/dimensions'

export type {
  NodeChartDimension,
  RecognitionActionChartDimension,
} from './chartOptions/dimensions'
export {
  nodeChartDimensionOptions,
  recognitionActionChartDimensionOptions,
} from './chartOptions/dimensions'

interface UseNodeStatisticsChartOptions {
  isMobile: Ref<boolean>
  nodeStatistics: Ref<NodeStatistics[]>
  recognitionActionStatistics: Ref<RecognitionActionStatistics[]>
  nodeChartDimension: Ref<NodeChartDimension>
  recognitionActionChartDimension: Ref<RecognitionActionChartDimension>
}

export const useNodeStatisticsChartOptions = (
  options: UseNodeStatisticsChartOptions,
) => {
  const nodeChartOption = computed(() => {
    return buildNodeChartOption(options.nodeStatistics.value, options.nodeChartDimension.value)
  })

  const recognitionActionChartOption = computed(() => {
    return buildRecognitionActionChartOption(
      options.recognitionActionStatistics.value,
      options.recognitionActionChartDimension.value,
    )
  })

  const mobileNodeChartOption = computed(() => adaptChartForMobile(nodeChartOption.value, options.isMobile.value))
  const mobileRecognitionActionChartOption = computed(() => {
    return adaptChartForMobile(recognitionActionChartOption.value, options.isMobile.value)
  })

  return {
    nodeChartOption,
    recognitionActionChartOption,
    mobileNodeChartOption,
    mobileRecognitionActionChartOption,
  }
}
