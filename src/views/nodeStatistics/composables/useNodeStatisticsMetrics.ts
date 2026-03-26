import { computed, type Ref } from 'vue'
import type { TaskInfo } from '../../../types'
import {
  NodeStatisticsAnalyzer,
  type NodeStatistics,
  type RecognitionActionStatistics,
} from '../../../utils/nodeStatistics'

export type StatMode = 'node' | 'recognition-action'

export interface NodeStatisticsSummary {
  totalNodes: number
  totalDuration: number
  avgDuration: number
  slowestNode: NodeStatistics
  uniqueNodes: number
}

export interface RecognitionActionStatisticsSummary {
  totalNodes: number
  avgRecognitionDuration: number
  avgActionDuration: number
  avgRecognitionAttempts: number
  slowestActionNode: RecognitionActionStatistics
  uniqueNodes: number
}

interface UseNodeStatisticsMetricsOptions {
  effectiveTasks: Ref<TaskInfo[]>
  searchKeyword: Ref<string>
  statMode: Ref<StatMode>
}

export const useNodeStatisticsMetrics = (options: UseNodeStatisticsMetricsOptions) => {
  const nodeStatistics = computed<NodeStatistics[]>(() => {
    if (options.effectiveTasks.value.length === 0) return []

    let stats = NodeStatisticsAnalyzer.analyze(options.effectiveTasks.value)
    if (options.searchKeyword.value.trim()) {
      const keyword = options.searchKeyword.value.toLowerCase()
      stats = stats.filter((item) => item.name.toLowerCase().includes(keyword))
    }
    return stats
  })

  const recognitionActionStatistics = computed<RecognitionActionStatistics[]>(() => {
    if (options.effectiveTasks.value.length === 0) return []

    let stats = NodeStatisticsAnalyzer.analyzeRecognitionAction(options.effectiveTasks.value)
    if (options.searchKeyword.value.trim()) {
      const keyword = options.searchKeyword.value.toLowerCase()
      stats = stats.filter((item) => item.name.toLowerCase().includes(keyword))
    }
    return stats
  })

  const statistics = computed(() => {
    return options.statMode.value === 'node' ? nodeStatistics.value : recognitionActionStatistics.value
  })

  const nodeSummary = computed<NodeStatisticsSummary | null>(() => {
    if (nodeStatistics.value.length === 0) return null

    const totalNodes = nodeStatistics.value.reduce((sum, item) => sum + item.count, 0)
    const totalDuration = nodeStatistics.value.reduce((sum, item) => sum + item.totalDuration, 0)
    const avgDuration = totalDuration / totalNodes
    const slowestNode = nodeStatistics.value[0]

    return {
      totalNodes,
      totalDuration,
      avgDuration,
      slowestNode,
      uniqueNodes: nodeStatistics.value.length,
    }
  })

  const recognitionActionSummary = computed<RecognitionActionStatisticsSummary | null>(() => {
    if (recognitionActionStatistics.value.length === 0) return null

    const totalNodes = recognitionActionStatistics.value.reduce((sum, item) => sum + item.count, 0)
    const totalRecognitionDuration = recognitionActionStatistics.value.reduce((sum, item) => sum + item.totalRecognitionDuration, 0)
    const totalActionDuration = recognitionActionStatistics.value.reduce((sum, item) => sum + item.totalActionDuration, 0)
    const totalRecognitionAttempts = recognitionActionStatistics.value.reduce((sum, item) => sum + item.totalRecognitionAttempts, 0)
    const avgRecognitionDuration = totalRecognitionDuration / totalNodes
    const avgActionDuration = totalActionDuration / totalNodes
    const avgRecognitionAttempts = totalRecognitionAttempts / totalNodes
    const slowestActionNode = [...recognitionActionStatistics.value].sort((a, b) => b.avgActionDuration - a.avgActionDuration)[0]

    return {
      totalNodes,
      avgRecognitionDuration,
      avgActionDuration,
      avgRecognitionAttempts,
      slowestActionNode,
      uniqueNodes: recognitionActionStatistics.value.length,
    }
  })

  return {
    nodeStatistics,
    recognitionActionStatistics,
    statistics,
    nodeSummary,
    recognitionActionSummary,
  }
}
