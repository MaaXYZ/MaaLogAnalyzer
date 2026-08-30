import { computed, type Ref } from 'vue'
import type {
  NodeStatistics,
  RecognitionActionStatistics,
  WaitFreezeStatistics,
} from '@windsland52/maa-log-parser/node-statistics'
import { adaptChartForMobile } from './chartOptions/baseBar'
import {
  buildNodeChartOption,
} from './chartOptions/nodeChartBuilder'
import {
  buildRecognitionActionChartOption,
} from './chartOptions/recognitionActionChartBuilder'
import {
  buildWaitFreezeChartOption,
} from './chartOptions/waitFreezeChartBuilder'
import type {
  NodeChartDimension,
  RecognitionActionChartDimension,
  WaitFreezeChartDimension,
} from './chartOptions/dimensions'

export type {
  NodeChartDimension,
  RecognitionActionChartDimension,
  WaitFreezeChartDimension,
} from './chartOptions/dimensions'
export {
  nodeChartDimensionOptions,
  recognitionActionChartDimensionOptions,
  waitFreezeChartDimensionOptions,
} from './chartOptions/dimensions'

interface UseNodeStatisticsChartOptions {
  isMobile: Ref<boolean>
  nodeStatistics: Ref<NodeStatistics[]>
  recognitionActionStatistics: Ref<RecognitionActionStatistics[]>
  waitFreezeStatistics: Ref<WaitFreezeStatistics[]>
  nodeChartDimension: Ref<NodeChartDimension>
  recognitionActionChartDimension: Ref<RecognitionActionChartDimension>
  waitFreezeChartDimension: Ref<WaitFreezeChartDimension>
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

  const waitFreezeChartOption = computed(() => {
    return buildWaitFreezeChartOption(
      options.waitFreezeStatistics.value,
      options.waitFreezeChartDimension.value,
    )
  })

  const mobileNodeChartOption = computed(() => adaptChartForMobile(nodeChartOption.value, options.isMobile.value))
  const mobileRecognitionActionChartOption = computed(() => {
    return adaptChartForMobile(recognitionActionChartOption.value, options.isMobile.value)
  })
  const mobileWaitFreezeChartOption = computed(() => {
    return adaptChartForMobile(waitFreezeChartOption.value, options.isMobile.value)
  })

  return {
    nodeChartOption,
    recognitionActionChartOption,
    waitFreezeChartOption,
    mobileNodeChartOption,
    mobileRecognitionActionChartOption,
    mobileWaitFreezeChartOption,
  }
}
