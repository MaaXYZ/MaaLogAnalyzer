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

/**
 * 三个分析器都是对「全部任务的全部节点」做一遍同步遍历，5.8MB 日志单次 130–440ms。
 * 而统计页的模板会把三份 summary 一起当 props 传下去（Vue 在渲染时就要求值），
 * 所以每切一次子标签，多个分析器都会被重跑一遍 —— 这是切标签卡顿的一部分来源，
 * 叠上表格全量渲染（千级 DOM 节点）才变得明显。
 *
 * 这里按「任务数组引用」做弱引用缓存：只要还是同一批任务，第二次起直接复用结果。
 * 用 WeakMap 而不是 Map：日志重新加载后旧数组自然被回收，不会把上一份日志的统计留在内存里。
 *
 * 注意：三个分析器必须各用一张表。曾经共用一个 WeakMap，key 只有任务数组，
 * 于是第二、三个标签拿到的是第一个分析器的结果（Wait Freezes 页显示成了节点统计）。
 * 缓存的是「分析结果」，搜索关键词过滤仍每次执行（一次 filter，代价可忽略）。
 */
const nodeAnalyzeCache = new WeakMap<TaskInfo[], NodeStatistics[]>()
const recognitionAnalyzeCache = new WeakMap<TaskInfo[], RecognitionActionStatistics[]>()
const waitFreezeAnalyzeCache = new WeakMap<TaskInfo[], WaitFreezeStatistics[]>()

const analyzeOnce = <T>(
  cache: WeakMap<TaskInfo[], T[]>,
  tasks: TaskInfo[],
  run: (tasks: TaskInfo[]) => T[],
): T[] => {
  const cached = cache.get(tasks)
  if (cached) return cached
  const result = run(tasks)
  cache.set(tasks, result)
  return result
}

const filterByKeyword = <T extends { name: string }>(items: T[], keyword: string): T[] => {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return items
  return items.filter((item) => item.name.toLowerCase().includes(normalized))
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
    const tasks = scopedTasks.value
    if (tasks.length === 0) return []
    return filterByKeyword(
      analyzeOnce(nodeAnalyzeCache, tasks, (batch) => NodeStatisticsAnalyzer.analyze(batch)),
      options.searchKeyword.value,
    )
  })

  const recognitionActionStatistics = computed<RecognitionActionStatistics[]>(() => {
    const tasks = scopedTasks.value
    if (tasks.length === 0) return []
    return filterByKeyword(
      analyzeOnce(recognitionAnalyzeCache, tasks, (batch) =>
        NodeStatisticsAnalyzer.analyzeRecognitionAction(batch),
      ),
      options.searchKeyword.value,
    )
  })

  const waitFreezeStatistics = computed<WaitFreezeStatistics[]>(() => {
    const tasks = scopedTasks.value
    if (tasks.length === 0) return []
    return filterByKeyword(
      analyzeOnce(waitFreezeAnalyzeCache, tasks, (batch) =>
        NodeStatisticsAnalyzer.analyzeWaitFreezes(batch),
      ),
      options.searchKeyword.value,
    )
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
