export type NodeChartDimension = 'count' | 'totalDuration' | 'avgDuration' | 'maxDuration'
export type RecognitionActionChartDimension =
  | 'avgRecognitionDuration'
  | 'maxRecognitionDuration'
  | 'avgActionDuration'
  | 'maxActionDuration'
  | 'avgRecognitionAttempts'

export const nodeChartDimensionOptions = [
  { label: '执行次数', value: 'count' },
  { label: '总耗时', value: 'totalDuration' },
  { label: '平均耗时', value: 'avgDuration' },
  { label: '最大耗时', value: 'maxDuration' },
]

export const recognitionActionChartDimensionOptions = [
  { label: '平均识别耗时', value: 'avgRecognitionDuration' },
  { label: '最大识别耗时', value: 'maxRecognitionDuration' },
  { label: '平均动作耗时', value: 'avgActionDuration' },
  { label: '最大动作耗时', value: 'maxActionDuration' },
  { label: '平均识别尝试', value: 'avgRecognitionAttempts' },
]
