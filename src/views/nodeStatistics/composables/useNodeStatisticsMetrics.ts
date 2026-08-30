import { computed, type Ref } from 'vue'
import type { TaskInfo } from '../../../types'
import {
  NodeStatisticsAnalyzer,
  type NodeStatistics,
  type RecognitionActionStatistics,
  type WaitFreezeStatistics,
} from '@windsland52/maa-log-parser/node-statistics'

export type StatMode = 'node' | 'recognition-action' | 'wait-freezes'

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

export interface WaitFreezeStatisticsSummary {
  totalCount: number
  totalRepeatCount: number
  totalElapsed: number
  avgElapsed: number
  focusNode: WaitFreezeStatistics
  uniqueNodes: number
}

interface UseNodeStatisticsMetricsOptions {
  effectiveTasks: Ref<TaskInfo[]>
  selectedTaskId: Ref<string | number>
  searchKeyword: Ref<string>
  statMode: Ref<StatMode>
}

export const useNodeStatisticsMetrics = (options: UseNodeStatisticsMetricsOptions) => {
  const scopedTasks = computed(() => {
    if (options.selectedTaskId.value === 'all') {
      return options.effectiveTasks.value
    }
    const taskId = Number(options.selectedTaskId.value)
    if (!Number.isFinite(taskId)) return []
    return options.effectiveTasks.value.filter((task) => task.task_id === taskId)
  })

  const nodeStatistics = computed<NodeStatistics[]>(() => {
    if (scopedTasks.value.length === 0) return []

    let stats = NodeStatisticsAnalyzer.analyze(scopedTasks.value)
    if (options.searchKeyword.value.trim()) {
      const keyword = options.searchKeyword.value.toLowerCase()
      stats = stats.filter((item) => item.name.toLowerCase().includes(keyword))
    }
    return stats
  })

  const recognitionActionStatistics = computed<RecognitionActionStatistics[]>(() => {
    if (scopedTasks.value.length === 0) return []

    let stats = NodeStatisticsAnalyzer.analyzeRecognitionAction(scopedTasks.value)
    if (options.searchKeyword.value.trim()) {
      const keyword = options.searchKeyword.value.toLowerCase()
      stats = stats.filter((item) => item.name.toLowerCase().includes(keyword))
    }
    return stats
  })

  const waitFreezeStatistics = computed<WaitFreezeStatistics[]>(() => {
    if (scopedTasks.value.length === 0) return []

    let stats = NodeStatisticsAnalyzer.analyzeWaitFreezes(scopedTasks.value)
    if (options.searchKeyword.value.trim()) {
      const keyword = options.searchKeyword.value.toLowerCase()
      stats = stats.filter((item) => item.name.toLowerCase().includes(keyword))
    }
    return stats
  })

  const statistics = computed(() => {
    if (options.statMode.value === 'node') return nodeStatistics.value
    if (options.statMode.value === 'recognition-action') return recognitionActionStatistics.value
    return waitFreezeStatistics.value
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
    const totalRecognitionDuration = recognitionActionStatistics.value.reduce(
      (sum, item) => sum + item.totalRecognitionDuration,
      0,
    )
    const totalActionDuration = recognitionActionStatistics.value.reduce(
      (sum, item) => sum + item.totalActionDuration,
      0,
    )
    const totalRecognitionAttempts = recognitionActionStatistics.value.reduce(
      (sum, item) => sum + item.totalRecognitionAttempts,
      0,
    )
    const avgRecognitionDuration = totalRecognitionDuration / totalNodes
    const avgActionDuration = totalActionDuration / totalNodes
    const avgRecognitionAttempts = totalRecognitionAttempts / totalNodes
    const slowestActionNode = [...recognitionActionStatistics.value].sort(
      (a, b) => b.avgActionDuration - a.avgActionDuration,
    )[0]

    return {
      totalNodes,
      avgRecognitionDuration,
      avgActionDuration,
      avgRecognitionAttempts,
      slowestActionNode,
      uniqueNodes: recognitionActionStatistics.value.length,
    }
  })

  const waitFreezeSummary = computed<WaitFreezeStatisticsSummary | null>(() => {
    if (waitFreezeStatistics.value.length === 0) return null

    const totalCount = waitFreezeStatistics.value.reduce((sum, item) => sum + item.count, 0)
    const totalRepeatCount = waitFreezeStatistics.value.reduce(
      (sum, item) => sum + item.repeatCount,
      0,
    )
    const totalElapsed = waitFreezeStatistics.value.reduce(
      (sum, item) => sum + item.totalElapsed,
      0,
    )
    const avgElapsed = totalCount > 0 ? totalElapsed / totalCount : 0
    const focusNode = [...waitFreezeStatistics.value].sort(
      (a, b) => b.repeatCount - a.repeatCount || b.avgElapsed - a.avgElapsed,
    )[0]

    return {
      totalCount,
      totalRepeatCount,
      totalElapsed,
      avgElapsed,
      focusNode,
      uniqueNodes: waitFreezeStatistics.value.length,
    }
  })

  return {
    nodeStatistics,
    recognitionActionStatistics,
    waitFreezeStatistics,
    statistics,
    nodeSummary,
    recognitionActionSummary,
    waitFreezeSummary,
  }
}
