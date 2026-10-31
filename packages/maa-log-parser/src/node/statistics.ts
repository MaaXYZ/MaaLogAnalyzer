import type { TaskInfo } from '../shared/types'
import { toTimestampMs } from '../shared/timestamp'
import { buildNodeRecognitionAttempts, buildNodeWaitFreezesFlowItems } from './flow'

export interface NodeStatistics {
  name: string
  count: number
  totalDuration: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  p50Duration: number
  p95Duration: number
  p99Duration: number
  successCount: number
  failCount: number
  successRate: number
  failContribution: number
  durations: number[]
  /**
   * 同一节点名下因「未结算」（status==='running'）被排除的执行次数。
   *
   * 为什么要单列：任务卡按节点实例计数（small.log 里 14 个），统计只算已结算实例（13 次），
   * 两个数字并排出现在同一屏却没有一句说明，用户只能怀疑「导入不全」。
   * 为什么不直接并进 count：运行中节点的耗时只是下界，混进平均值/分位数会污染所有指标；
   * 先把口径说清楚，比让数字看起来对得上更重要。
   */
  unsettledCount?: number
}

/**
 * 三张统计子表的「口径覆盖」汇总：每一张表实际算了多少、跳过了多少、跳过的叫什么。
 *
 * 为什么要这个：任务卡按节点实例计数，节点表只算已结算实例，识别/动作表还会跳过没有识别
 * 尝试记录的实例。同一份 small.log 于是出现「14 个实例 / 13 次 / 13 次」，focus 日志出现
 * 「138 / 138 / 137」，并排出现却一句说明都没有，用户只能怀疑导入不全。
 * UI 拿这个结构在数字面板写一句「不含 N 个未结算节点」，三张表的差额就都能对上账。
 */
export interface NodeStatisticsCoverage {
  /** 节点实例总数（任务卡口径） */
  nodeInstances: number
  /** 计入节点表的已结算次数 */
  settledExecutions: number
  /** 因未结算（status==='running'）被节点表排除的次数 */
  unsettledExecutions: number
  /** 被排除的未结算节点名（去重，供脚注点名） */
  unsettledNames: string[]
  /** 计入识别/动作表的次数（有识别尝试记录且已结算） */
  recognitionActionExecutions: number
  /** 被识别/动作表排除的次数（无识别尝试记录，或未结算） */
  recognitionActionExcluded: number
  /** 被识别/动作表排除的节点名（去重） */
  recognitionActionExcludedNames: string[]
}

export interface RecognitionActionStatistics {
  name: string
  count: number
  avgRecognitionDuration: number
  minRecognitionDuration: number
  maxRecognitionDuration: number
  p50RecognitionDuration: number
  p95RecognitionDuration: number
  p99RecognitionDuration: number
  totalRecognitionDuration: number
  recognitionCount: number
  avgActionDuration: number
  minActionDuration: number
  maxActionDuration: number
  p50ActionDuration: number
  p95ActionDuration: number
  p99ActionDuration: number
  totalActionDuration: number
  actionCount: number
  avgRecognitionAttempts: number
  totalRecognitionAttempts: number
  singleAttemptCount: number
  multiAttemptCount: number
  firstTrySuccessCount: number
  firstTrySuccessRate: number
  successCount: number
  failCount: number
  successRate: number
  failContribution: number
}

export interface WaitFreezeStatistics {
  name: string
  count: number
  successCount: number
  failCount: number
  successRate: number
  totalElapsed: number
  avgElapsed: number
  minElapsed: number
  maxElapsed: number
  elapsedValues: number[]
  preCount: number
  contextCount: number
  repeatCount: number
  postCount: number
  otherCount: number
  totalRecoIds: number
  avgRecoIds: number
  imageCount: number
}

export const summarizeDurations = (durations: number[]) => {
  let total = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let count = 0
  for (const duration of durations) {
    if (!Number.isFinite(duration)) continue
    total += duration
    count += 1
    if (duration < min) min = duration
    if (duration > max) max = duration
  }

  if (count === 0) {
    return { total: 0, average: 0, min: 0, max: 0 }
  }

  return {
    total,
    average: total / count,
    min,
    max,
  }
}

export const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (sorted.length - 1) * (p / 100)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower)
}

interface SettledNodeExecution {
  name: string
  status: 'success' | 'failed'
  duration: number
}

interface CollectedNodeExecutions {
  settled: SettledNodeExecution[]
  /** 每个未结算实例一条记录（可重复），用于按名字计数与总数核对 */
  unsettledNames: string[]
}

/**
 * 把节点实例拆成「已结算样本」与「未结算名字」两桶。
 *
 * 为什么单独抽出来：analyze() 与 summarizeCoverage() 必须共用同一条跳过规则，
 * 否则「统计 13 次 + 未结算 1 个」凑不回任务卡的 14 个实例，口径自己又会打架。
 * 为什么未结算判断放在算耗时之前：任务末尾的运行中节点往往没有 end_ts 也没有下一个节点，
 * 拿不到时长；若先按「时长不可用」丢弃，就分不清它是未结算还是时间戳坏了。
 */
const collectNodeExecutions = (tasks: TaskInfo[]): CollectedNodeExecutions => {
  const settled: SettledNodeExecution[] = []
  const unsettledNames: string[] = []

  for (const task of tasks) {
    const nodes = task.nodes

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const nextNode = nodes[i + 1]

      if (node.status === 'running') {
        unsettledNames.push(node.name)
        continue
      }

      let duration: number
      const currentTime = toTimestampMs(node.ts)
      if (node.end_ts) {
        duration = toTimestampMs(node.end_ts) - currentTime
      } else if (nextNode) {
        duration = toTimestampMs(nextNode.ts) - currentTime
      } else if (task.end_time) {
        duration = toTimestampMs(task.end_time) - currentTime
      } else {
        continue
      }

      if (!Number.isFinite(duration) || duration < 0 || duration > 3600000) {
        continue
      }

      settled.push({ name: node.name, status: node.status, duration })
    }
  }

  return { settled, unsettledNames }
}

export class NodeStatisticsAnalyzer {
  static analyze(tasks: TaskInfo[]): NodeStatistics[] {
    const { settled, unsettledNames } = collectNodeExecutions(tasks)

    const unsettledCountByName = new Map<string, number>()
    for (const name of unsettledNames) {
      unsettledCountByName.set(name, (unsettledCountByName.get(name) ?? 0) + 1)
    }

    const statsMap = new Map<
      string,
      {
        durations: number[]
        successCount: number
        failCount: number
      }
    >()

    for (const execution of settled) {
      if (!statsMap.has(execution.name)) {
        statsMap.set(execution.name, {
          durations: [],
          successCount: 0,
          failCount: 0,
        })
      }

      const stats = statsMap.get(execution.name)!
      stats.durations.push(execution.duration)

      if (execution.status === 'success') {
        stats.successCount++
      } else {
        stats.failCount++
      }
    }

    const result: NodeStatistics[] = []

    for (const [name, stats] of statsMap.entries()) {
      const durations = stats.durations
      const count = durations.length

      if (count === 0) continue

      const durationSummary = summarizeDurations(durations)
      const settledCount = stats.successCount + stats.failCount
      const successRate = settledCount > 0 ? (stats.successCount / settledCount) * 100 : 0

      result.push({
        name,
        count,
        totalDuration: durationSummary.total,
        avgDuration: durationSummary.average,
        minDuration: durationSummary.min,
        maxDuration: durationSummary.max,
        p50Duration: percentile(durations, 50),
        p95Duration: percentile(durations, 95),
        p99Duration: percentile(durations, 99),
        successCount: stats.successCount,
        failCount: stats.failCount,
        successRate,
        failContribution: 0,
        durations,
        unsettledCount: unsettledCountByName.get(name) ?? 0,
      })
    }

    const totalFailCount = result.reduce((sum, item) => sum + item.failCount, 0)
    for (const item of result) {
      item.failContribution = totalFailCount > 0 ? (item.failCount / totalFailCount) * 100 : 0
    }

    result.sort((a, b) => b.avgDuration - a.avgDuration)
    return result
  }

  /**
   * 三张统计表的覆盖口径（实例数 / 已结算 / 未结算 / 识别动作表排除项）。
   *
   * 为什么必须由 parser 出：analyze() 只返回已结算行，一个只在日志末尾运行中的节点
   * （small.log 的 ShoppingDailyExchangeMoneyController）连行都没有，行上的 unsettledCount
   * 也拿不到它的名字；识别/动作表同理还会跳过无识别尝试的实例。UI 不该自己再走一遍 TASK 树
   * 去猜口径，否则「谁的跳过规则才是准的」又变成新的对账问题。
   * 与 analyze() 共用同一条未结算判据（node.status === 'running'），两处不要各写一份。
   */
  static summarizeCoverage(tasks: TaskInfo[]): NodeStatisticsCoverage {
    let nodeInstances = 0
    let settledExecutions = 0
    let unsettledExecutions = 0
    let recognitionActionExecutions = 0
    const unsettledNames: string[] = []
    const recognitionActionExcludedNames: string[] = []

    for (const task of tasks) {
      for (const node of task.nodes) {
        nodeInstances++
        if (node.status === 'running') {
          unsettledExecutions++
          unsettledNames.push(node.name)
          recognitionActionExcludedNames.push(node.name)
          continue
        }

        settledExecutions++
        // 与 analyzeRecognitionAction 的入选条件保持一致：有识别尝试记录才进识别/动作表
        if (buildNodeRecognitionAttempts(node).length > 0) {
          recognitionActionExecutions++
        } else {
          recognitionActionExcludedNames.push(node.name)
        }
      }
    }

    return {
      nodeInstances,
      settledExecutions,
      unsettledExecutions,
      unsettledNames: [...new Set(unsettledNames)],
      recognitionActionExecutions,
      recognitionActionExcluded: nodeInstances - recognitionActionExecutions,
      recognitionActionExcludedNames: [...new Set(recognitionActionExcludedNames)],
    }
  }

  static getTopSlowest(tasks: TaskInfo[], topN = 10): NodeStatistics[] {
    const allStats = this.analyze(tasks)
    return allStats.slice(0, topN)
  }

  static getTopFrequent(tasks: TaskInfo[], topN = 10): NodeStatistics[] {
    const allStats = this.analyze(tasks)
    return [...allStats].sort((a, b) => b.count - a.count).slice(0, topN)
  }

  static getTopFailed(tasks: TaskInfo[], topN = 10): NodeStatistics[] {
    const allStats = this.analyze(tasks)
    return [...allStats]
      .filter((s) => s.failCount > 0)
      .sort((a, b) => b.failCount / b.count - a.failCount / a.count)
      .slice(0, topN)
  }

  static analyzeRecognitionAction(tasks: TaskInfo[]): RecognitionActionStatistics[] {
    const statsMap = new Map<
      string,
      {
        recognitionDurations: number[]
        actionDurations: number[]
        recognitionAttempts: number[]
        successCount: number
        failCount: number
        singleAttemptCount: number
        multiAttemptCount: number
        firstTrySuccessCount: number
      }
    >()

    for (const task of tasks) {
      const nodes = task.nodes

      for (const node of nodes) {
        const attempts = buildNodeRecognitionAttempts(node)
        if (attempts.length === 0) continue

        if (!statsMap.has(node.name)) {
          statsMap.set(node.name, {
            recognitionDurations: [],
            actionDurations: [],
            recognitionAttempts: [],
            successCount: 0,
            failCount: 0,
            singleAttemptCount: 0,
            multiAttemptCount: 0,
            firstTrySuccessCount: 0,
          })
        }

        const stats = statsMap.get(node.name)!
        stats.recognitionAttempts.push(attempts.length)
        if (attempts.length === 1) {
          stats.singleAttemptCount++
        } else {
          stats.multiAttemptCount++
        }
        if (attempts[0]?.status === 'success') {
          stats.firstTrySuccessCount++
        }

        if (attempts.length > 0) {
          const firstAttemptTs = toTimestampMs(attempts[0].ts)
          const lastAttempt = attempts[attempts.length - 1]
          const lastAttemptTime = toTimestampMs(lastAttempt.end_ts || lastAttempt.ts)
          const recognitionDuration = lastAttemptTime - firstAttemptTs

          if (
            Number.isFinite(recognitionDuration) &&
            recognitionDuration >= 0 &&
            recognitionDuration < 3600000
          ) {
            stats.recognitionDurations.push(recognitionDuration)
          }

          const nodeCompleteTime = toTimestampMs(node.end_ts || node.ts)
          const actionDuration = nodeCompleteTime - lastAttemptTime

          if (Number.isFinite(actionDuration) && actionDuration >= 0 && actionDuration < 3600000) {
            stats.actionDurations.push(actionDuration)
          }
        }

        if (node.status === 'success') {
          stats.successCount++
        } else if (node.status === 'failed') {
          stats.failCount++
        }
      }
    }

    const result: RecognitionActionStatistics[] = []

    for (const [name, stats] of statsMap.entries()) {
      const count = stats.successCount + stats.failCount
      if (count === 0) continue

      const recognitionDurations = stats.recognitionDurations
      const recognitionCount = recognitionDurations.length
      const recognitionSummary = summarizeDurations(recognitionDurations)

      const actionDurations = stats.actionDurations
      const actionCount = actionDurations.length
      const actionSummary = summarizeDurations(actionDurations)

      const totalRecognitionAttempts = stats.recognitionAttempts.reduce((sum, a) => sum + a, 0)
      const avgRecognitionAttempts = totalRecognitionAttempts / stats.recognitionAttempts.length

      const successRate = (stats.successCount / count) * 100

      result.push({
        name,
        count,
        avgRecognitionDuration: recognitionSummary.average,
        minRecognitionDuration: recognitionSummary.min,
        maxRecognitionDuration: recognitionSummary.max,
        p50RecognitionDuration: percentile(recognitionDurations, 50),
        p95RecognitionDuration: percentile(recognitionDurations, 95),
        p99RecognitionDuration: percentile(recognitionDurations, 99),
        totalRecognitionDuration: recognitionSummary.total,
        recognitionCount,
        avgActionDuration: actionSummary.average,
        minActionDuration: actionSummary.min,
        maxActionDuration: actionSummary.max,
        p50ActionDuration: percentile(actionDurations, 50),
        p95ActionDuration: percentile(actionDurations, 95),
        p99ActionDuration: percentile(actionDurations, 99),
        totalActionDuration: actionSummary.total,
        actionCount,
        avgRecognitionAttempts,
        totalRecognitionAttempts,
        singleAttemptCount: stats.singleAttemptCount,
        multiAttemptCount: stats.multiAttemptCount,
        firstTrySuccessCount: stats.firstTrySuccessCount,
        firstTrySuccessRate:
          stats.firstTrySuccessCount > 0 ? (stats.firstTrySuccessCount / count) * 100 : 0,
        successCount: stats.successCount,
        failCount: stats.failCount,
        successRate,
        failContribution: 0,
      })
    }

    const totalFailCount = result.reduce((sum, item) => sum + item.failCount, 0)
    for (const item of result) {
      item.failContribution = totalFailCount > 0 ? (item.failCount / totalFailCount) * 100 : 0
    }

    result.sort((a, b) => b.avgActionDuration - a.avgActionDuration)
    return result
  }

  static analyzeWaitFreezes(tasks: TaskInfo[]): WaitFreezeStatistics[] {
    const statsMap = new Map<
      string,
      {
        elapsedValues: number[]
        successCount: number
        failCount: number
        phaseCounts: Record<string, number>
        totalRecoIds: number
        imageCount: number
      }
    >()

    for (const task of tasks) {
      for (const node of task.nodes) {
        const items = buildNodeWaitFreezesFlowItems(node)
        for (const item of items) {
          if (item.status === 'running') continue

          const wf = item.wait_freezes_details
          const phase = wf?.phase || 'other'
          const elapsed = wf?.elapsed
          const recoIds = wf?.reco_ids?.length ?? 0
          const images = wf?.images?.length ?? 0

          if (!statsMap.has(item.name)) {
            statsMap.set(item.name, {
              elapsedValues: [],
              successCount: 0,
              failCount: 0,
              phaseCounts: {},
              totalRecoIds: 0,
              imageCount: 0,
            })
          }

          const stats = statsMap.get(item.name)!
          if (typeof elapsed === 'number' && Number.isFinite(elapsed)) {
            stats.elapsedValues.push(elapsed)
          }
          if (item.status === 'success') {
            stats.successCount++
          } else if (item.status === 'failed') {
            stats.failCount++
          }
          stats.phaseCounts[phase] = (stats.phaseCounts[phase] ?? 0) + 1
          stats.totalRecoIds += recoIds
          stats.imageCount += images
        }
      }
    }

    const result: WaitFreezeStatistics[] = []

    for (const [name, stats] of statsMap.entries()) {
      const count = stats.successCount + stats.failCount
      if (count === 0) continue

      const elapsedSummary = summarizeDurations(stats.elapsedValues)
      const successRate = (stats.successCount / count) * 100

      result.push({
        name,
        count,
        successCount: stats.successCount,
        failCount: stats.failCount,
        successRate,
        totalElapsed: elapsedSummary.total,
        avgElapsed: elapsedSummary.average,
        minElapsed: elapsedSummary.min,
        maxElapsed: elapsedSummary.max,
        elapsedValues: stats.elapsedValues,
        preCount: stats.phaseCounts.pre ?? 0,
        contextCount: stats.phaseCounts.context ?? 0,
        repeatCount: stats.phaseCounts.repeat ?? 0,
        postCount: stats.phaseCounts.post ?? 0,
        otherCount: stats.phaseCounts.other ?? 0,
        totalRecoIds: stats.totalRecoIds,
        avgRecoIds: count > 0 ? stats.totalRecoIds / count : 0,
        imageCount: stats.imageCount,
      })
    }

    result.sort((a, b) => b.avgElapsed - a.avgElapsed)
    return result
  }
}
