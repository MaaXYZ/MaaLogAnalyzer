import type { TaskInfo, NodeInfo } from '../types'

/**
 * 节点统计信息
 */
export interface NodeStatistics {
  name: string                    // 节点名称
  count: number                   // 执行次数
  totalDuration: number           // 总执行时间（毫秒）
  avgDuration: number             // 平均执行时间（毫秒）
  minDuration: number             // 最小执行时间（毫秒）
  maxDuration: number             // 最大执行时间（毫秒）
  successCount: number            // 成功次数
  failCount: number               // 失败次数
  successRate: number             // 成功率（百分比）
  durations: number[]             // 所有执行时间记录
}

/**
 * 识别和动作统计信息
 */
export interface RecognitionActionStatistics {
  name: string                    // 节点名称
  count: number                   // 执行次数

  // 识别阶段统计
  avgRecognitionDuration: number  // 平均识别时间（毫秒）
  minRecognitionDuration: number  // 最小识别时间（毫秒）
  maxRecognitionDuration: number  // 最大识别时间（毫秒）
  totalRecognitionDuration: number // 总识别时间（毫秒）
  recognitionCount: number        // 有识别数据的节点数量

  // 动作阶段统计
  avgActionDuration: number       // 平均动作时间（毫秒）
  minActionDuration: number       // 最小动作时间（毫秒）
  maxActionDuration: number       // 最大动作时间（毫秒）
  totalActionDuration: number     // 总动作时间（毫秒）
  actionCount: number             // 有动作数据的节点数量

  // 识别尝试统计
  avgRecognitionAttempts: number  // 平均识别尝试次数
  totalRecognitionAttempts: number // 总识别尝试次数

  // 成功率
  successCount: number
  failCount: number
  successRate: number
}

/**
 * 节点统计分析器
 */
export class NodeStatisticsAnalyzer {
  /**
   * 分析所有任务的节点统计信息
   */
  static analyze(tasks: TaskInfo[]): NodeStatistics[] {
    const statsMap = new Map<string, {
      durations: number[]
      successCount: number
      failCount: number
    }>()

    // 遍历所有任务的所有节点
    for (const task of tasks) {
      const nodes = task.nodes

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const nextNode = nodes[i + 1]

        // 计算节点执行时间
        let duration = 0
        if (nextNode) {
          // 使用下一个节点的时间戳减去当前节点的时间戳
          const currentTime = new Date(node.timestamp).getTime()
          const nextTime = new Date(nextNode.timestamp).getTime()
          duration = nextTime - currentTime
        } else if (task.end_time) {
          // 最后一个节点，使用任务结束时间
          const currentTime = new Date(node.timestamp).getTime()
          const endTime = new Date(task.end_time).getTime()
          duration = endTime - currentTime
        } else {
          // 任务未结束，跳过最后一个节点
          continue
        }

        // 过滤异常值（负数或过大的值）
        if (duration < 0 || duration > 3600000) { // 超过1小时视为异常
          continue
        }

        // 获取或创建统计记录
        if (!statsMap.has(node.name)) {
          statsMap.set(node.name, {
            durations: [],
            successCount: 0,
            failCount: 0
          })
        }

        const stats = statsMap.get(node.name)!
        stats.durations.push(duration)

        if (node.status === 'success') {
          stats.successCount++
        } else {
          stats.failCount++
        }
      }
    }

    // 计算统计指标
    const result: NodeStatistics[] = []

    for (const [name, stats] of statsMap.entries()) {
      const durations = stats.durations
      const count = durations.length

      if (count === 0) continue

      const totalDuration = durations.reduce((sum, d) => sum + d, 0)
      const avgDuration = totalDuration / count
      const minDuration = Math.min(...durations)
      const maxDuration = Math.max(...durations)
      const successRate = (stats.successCount / (stats.successCount + stats.failCount)) * 100

      result.push({
        name,
        count,
        totalDuration,
        avgDuration,
        minDuration,
        maxDuration,
        successCount: stats.successCount,
        failCount: stats.failCount,
        successRate,
        durations
      })
    }

    // 按平均执行时间降序排序
    result.sort((a, b) => b.avgDuration - a.avgDuration)

    return result
  }

  /**
   * 获取执行时间最长的前N个节点
   */
  static getTopSlowest(tasks: TaskInfo[], topN: number = 10): NodeStatistics[] {
    const allStats = this.analyze(tasks)
    return allStats.slice(0, topN)
  }

  /**
   * 获取执行次数最多的前N个节点
   */
  static getTopFrequent(tasks: TaskInfo[], topN: number = 10): NodeStatistics[] {
    const allStats = this.analyze(tasks)
    return allStats.sort((a, b) => b.count - a.count).slice(0, topN)
  }

  /**
   * 获取失败率最高的前N个节点
   */
  static getTopFailed(tasks: TaskInfo[], topN: number = 10): NodeStatistics[] {
    const allStats = this.analyze(tasks)
    return allStats
      .filter(s => s.failCount > 0)
      .sort((a, b) => (b.failCount / b.count) - (a.failCount / a.count))
      .slice(0, topN)
  }

  /**
   * 分析识别和动作的统计信息
   */
  static analyzeRecognitionAction(tasks: TaskInfo[]): RecognitionActionStatistics[] {
    const statsMap = new Map<string, {
      recognitionDurations: number[]
      actionDurations: number[]
      recognitionAttempts: number[]
      successCount: number
      failCount: number
    }>()

    // 遍历所有任务的所有节点
    for (const task of tasks) {
      const nodes = task.nodes

      for (const node of nodes) {
        const attempts = node.recognition_attempts || []

        // 跳过没有识别尝试的节点
        if (attempts.length === 0) continue

        // 获取或创建统计记录
        if (!statsMap.has(node.name)) {
          statsMap.set(node.name, {
            recognitionDurations: [],
            actionDurations: [],
            recognitionAttempts: [],
            successCount: 0,
            failCount: 0
          })
        }

        const stats = statsMap.get(node.name)!

        // 记录识别尝试次数
        stats.recognitionAttempts.push(attempts.length)

        // 计算识别阶段时间（从第一次识别到最后一次识别）
        if (attempts.length > 0) {
          const firstAttemptTime = new Date(attempts[0].timestamp).getTime()
          const lastAttemptTime = new Date(attempts[attempts.length - 1].timestamp).getTime()
          const recognitionDuration = lastAttemptTime - firstAttemptTime

          // 只有当有多次识别尝试时，识别时间才有意义
          if (attempts.length > 1 && recognitionDuration >= 0 && recognitionDuration < 3600000) {
            stats.recognitionDurations.push(recognitionDuration)
          }

          // 计算动作阶段时间（从最后一次识别到节点完成）
          const nodeCompleteTime = new Date(node.timestamp).getTime()
          const actionDuration = nodeCompleteTime - lastAttemptTime

          if (actionDuration >= 0 && actionDuration < 3600000) {
            stats.actionDurations.push(actionDuration)
          }
        }

        // 统计成功/失败
        if (node.status === 'success') {
          stats.successCount++
        } else {
          stats.failCount++
        }
      }
    }

    // 计算统计指标
    const result: RecognitionActionStatistics[] = []

    for (const [name, stats] of statsMap.entries()) {
      const count = stats.successCount + stats.failCount

      if (count === 0) continue

      // 识别阶段统计
      const recognitionDurations = stats.recognitionDurations
      const recognitionCount = recognitionDurations.length
      const totalRecognitionDuration = recognitionDurations.reduce((sum, d) => sum + d, 0)
      const avgRecognitionDuration = recognitionCount > 0 ? totalRecognitionDuration / recognitionCount : 0
      const minRecognitionDuration = recognitionCount > 0 ? Math.min(...recognitionDurations) : 0
      const maxRecognitionDuration = recognitionCount > 0 ? Math.max(...recognitionDurations) : 0

      // 动作阶段统计
      const actionDurations = stats.actionDurations
      const actionCount = actionDurations.length
      const totalActionDuration = actionDurations.reduce((sum, d) => sum + d, 0)
      const avgActionDuration = actionCount > 0 ? totalActionDuration / actionCount : 0
      const minActionDuration = actionCount > 0 ? Math.min(...actionDurations) : 0
      const maxActionDuration = actionCount > 0 ? Math.max(...actionDurations) : 0

      // 识别尝试统计
      const totalRecognitionAttempts = stats.recognitionAttempts.reduce((sum, a) => sum + a, 0)
      const avgRecognitionAttempts = totalRecognitionAttempts / stats.recognitionAttempts.length

      // 成功率
      const successRate = (stats.successCount / count) * 100

      result.push({
        name,
        count,
        avgRecognitionDuration,
        minRecognitionDuration,
        maxRecognitionDuration,
        totalRecognitionDuration,
        recognitionCount,
        avgActionDuration,
        minActionDuration,
        maxActionDuration,
        totalActionDuration,
        actionCount,
        avgRecognitionAttempts,
        totalRecognitionAttempts,
        successCount: stats.successCount,
        failCount: stats.failCount,
        successRate
      })
    }

    // 按平均动作时间降序排序
    result.sort((a, b) => b.avgActionDuration - a.avgActionDuration)

    return result
  }
}
