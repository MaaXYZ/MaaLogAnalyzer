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

export class NodeStatisticsAnalyzer {
  static analyze(tasks: TaskInfo[]): NodeStatistics[] {
    const statsMap = new Map<
      string,
      {
        durations: number[]
        successCount: number
        failCount: number
      }
    >()

    for (const task of tasks) {
      const nodes = task.nodes

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const nextNode = nodes[i + 1]

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
        if (node.status === 'running') {
          continue
        }

        if (!statsMap.has(node.name)) {
          statsMap.set(node.name, {
            durations: [],
            successCount: 0,
            failCount: 0,
          })
        }

        const stats = statsMap.get(node.name)!
        stats.durations.push(duration)

        if (node.status === 'success') {
          stats.successCount++
        } else if (node.status === 'failed') {
          stats.failCount++
        }
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
      })
    }

    const totalFailCount = result.reduce((sum, item) => sum + item.failCount, 0)
    for (const item of result) {
      item.failContribution = totalFailCount > 0 ? (item.failCount / totalFailCount) * 100 : 0
    }

    result.sort((a, b) => b.avgDuration - a.avgDuration)
    return result
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
