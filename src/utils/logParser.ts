import type { LogEntry, TaskInfo, NodeInfo, Statistics, PerformanceData } from '../types'

export class LogParser {
  private entries: LogEntry[] = []

  parseFile(content: string): LogEntry[] {
    const lines = content.split('\n')
    const entries: LogEntry[] = []

    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1].trim()
      if (!line) continue

      try {
        const entry = JSON.parse(line) as LogEntry
        
        // 标准化 sink_type
        if (typeof entry.sink_type === 'object') {
          entry.sink_type = (entry.sink_type as any).sink_type || 'unknown'
        }
        
        // 确保必需字段
        if (!entry.timestamp) entry.timestamp = 'unknown'
        if (!entry.message) entry.message = 'unknown'
        if (!entry.details) entry.details = {}
        
        entry._line = lineNum
        entries.push(entry)
      } catch (e) {
        // 如果是第一行解析失败，直接抛出错误
        if (lineNum === 1) {
          console.error(`第 1 行解析失败: ${e instanceof Error ? e.message : String(e)}`)
          throw new Error(`该文件不是格式化日志文件 (jsonl) 。普通日志请将日志分析功能改为文本搜索模式。`)
        }
        console.warn(`解析第 ${lineNum} 行失败:`, e)
      }
    }

    this.entries = entries
    return entries
  }

  getTasks(): TaskInfo[] {
    const tasksMap = new Map<number, TaskInfo>()
    const validTaskIds = new Set<number>()

    // 第一遍：找出所有有 Task.Starting 的 task_id
    for (const entry of this.entries) {
      if (entry.message.includes('Task.Starting')) {
        const taskId = entry.details?.task_id
        if (taskId) {
          validTaskIds.add(taskId)
        }
      }
    }

    // 第二遍：只处理有效的任务
    for (const entry of this.entries) {
      const taskId = entry.details?.task_id
      if (!taskId || !validTaskIds.has(taskId)) continue

      if (!tasksMap.has(taskId)) {
        tasksMap.set(taskId, {
          task_id: taskId,
          entry: '',
          start_time: entry.timestamp,
          status: 'running',
          entries: []
        })
      }

      const task = tasksMap.get(taskId)!
      task.entries.push(entry)
      task.end_time = entry.timestamp

      // 更新任务信息
      if (entry.message.includes('Task.Starting')) {
        task.entry = entry.details.entry || 'Unknown'
      } else if (entry.message.includes('Task.Succeeded')) {
        task.status = 'succeeded'
      } else if (entry.message.includes('Task.Failed')) {
        task.status = 'failed'
      }
    }

    return Array.from(tasksMap.values())
  }

  getTaskNodes(task: TaskInfo): NodeInfo[] {
    const nodes: NodeInfo[] = []
    let currentNode: Partial<NodeInfo> | null = null

    // 第一步：扫描所有 NextList，建立节点名到属性的映射
    const nodePropsMap = new Map<string, { jump_back: boolean; anchor: boolean }>()
    for (const entry of task.entries) {
      if (entry.message.includes('NextList.Starting') || entry.message.includes('NextList.Failed')) {
        const list = entry.details.list || []
        for (const item of list) {
          const nodeName = item.name
          if (nodeName && !nodePropsMap.has(nodeName)) {
            nodePropsMap.set(nodeName, {
              jump_back: item.jump_back || false,
              anchor: item.anchor || false
            })
          }
        }
      }
    }
    
    // 调试：输出映射表
    console.log('节点属性映射表:', Array.from(nodePropsMap.entries()).filter(([_, props]) => props.jump_back || props.anchor))

    // 第二步：解析节点
    for (const entry of task.entries) {
      const msg = entry.message
      const details = entry.details
      const name = details.name || details.entry || ''

      // 跳过 Tasker 级别的消息
      if (msg.includes('Tasker.')) continue

      if (msg.includes('PipelineNode.Starting')) {
        // 从映射表中查找节点属性
        const props = nodePropsMap.get(name) || { jump_back: false, anchor: false }
        
        // 调试：输出有标记的节点
        if (props.jump_back || props.anchor) {
          console.log(`创建节点: ${name}, jump_back: ${props.jump_back}, anchor: ${props.anchor}`)
        }
        
        currentNode = {
          name,
          timestamp: entry.timestamp,
          status: 'running',
          node_id: details.node_id,
          actions: [],
          next_list: [],
          entries: [entry],  // 开始收集日志条目
          jump_back: props.jump_back,
          anchor: props.anchor
        }
      } else if (msg.includes('PipelineNode.Succeeded') && currentNode) {
        currentNode.status = 'success'
        currentNode.entries!.push(entry)
        nodes.push(currentNode as NodeInfo)
        currentNode = null
      } else if (msg.includes('PipelineNode.Failed') && currentNode) {
        currentNode.status = 'failed'
        currentNode.entries!.push(entry)
        nodes.push(currentNode as NodeInfo)
        currentNode = null
      }

      // 收集节点内的操作和日志
      if (currentNode) {
        // 添加日志条目
        if (!msg.includes('PipelineNode.Starting')) {
          currentNode.entries!.push(entry)
        }

        if (msg.includes('Recognition.Succeeded')) {
          currentNode.actions!.push({
            type: 'recognition',
            name,
            status: 'success',
            reco_id: details.reco_id,
            details: details
          })
          // 提取增强的识别详情
          if (!currentNode.recognitionDetails) currentNode.recognitionDetails = []
          const recognition = details.recognition
          if (recognition) {
            currentNode.recognitionDetails.push({
              reco_id: details.reco_id,
              name: name,
              algorithm: recognition.algorithm,
              score: recognition.best_result?.score,
              box: recognition.box,
              text: recognition.best_result?.text,
              raw_detail: recognition
            })
          }
        } else if (msg.includes('Recognition.Failed')) {
          currentNode.actions!.push({
            type: 'recognition',
            name,
            status: 'failed',
            reco_id: details.reco_id,
            details: details
          })
          // 提取识别失败的详情（如果有）
          if (!currentNode.recognitionDetails) currentNode.recognitionDetails = []
          const recognition = details.recognition
          if (recognition) {
            currentNode.recognitionDetails.push({
              reco_id: details.reco_id,
              name: name,
              algorithm: recognition.algorithm,
              score: recognition.best_result?.score,
              box: recognition.box,
              text: recognition.best_result?.text,
              raw_detail: recognition
            })
          }
        } else if (msg.includes('Action.Succeeded')) {
          currentNode.actions!.push({
            type: 'action',
            name,
            status: 'success',
            action_id: details.action_id,
            details: details
          })
          // 提取增强的动作详情
          if (!currentNode.actionDetails) currentNode.actionDetails = []
          const action = details.action
          if (action) {
            currentNode.actionDetails.push({
              action_id: details.action_id,
              name: name,
              action_type: action.action_type,
              target_box: action.box,
              success: action.success,
              raw_detail: action
            })
          }
        } else if (msg.includes('Action.Failed')) {
          currentNode.actions!.push({
            type: 'action',
            name,
            status: 'failed',
            action_id: details.action_id,
            details: details
          })
          // 提取动作失败的详情（如果有）
          if (!currentNode.actionDetails) currentNode.actionDetails = []
          const action = details.action
          if (action) {
            currentNode.actionDetails.push({
              action_id: details.action_id,
              name: name,
              action_type: action.action_type,
              target_box: action.box,
              success: action.success,
              raw_detail: action
            })
          }
        } else if (msg.includes('NextList.Starting')) {
          const nextList = details.list || []
          currentNode.next_list = nextList.map((n: any) => ({
            name: n.name || '',
            anchor: n.anchor || false,
            jump_back: n.jump_back || false
          })).slice(0, 10)
        }
      }
    }

    return nodes
  }

  getStatistics(): Statistics {
    const sinkTypes: Record<string, number> = {}
    const messageTypes: Record<string, number> = {}
    let failures = 0

    for (const entry of this.entries) {
      sinkTypes[entry.sink_type] = (sinkTypes[entry.sink_type] || 0) + 1
      messageTypes[entry.message] = (messageTypes[entry.message] || 0) + 1
      
      if (entry.message.includes('Failed')) {
        failures++
      }
    }

    const timestamps = this.entries.map(e => e.timestamp).filter(t => t !== 'unknown')
    
    return {
      totalEntries: this.entries.length,
      sinkTypes,
      messageTypes,
      tasks: this.getTasks().length,
      failures,
      timeRange: {
        start: timestamps[0] || '',
        end: timestamps[timestamps.length - 1] || ''
      }
    }
  }

  getPerformanceData(): PerformanceData[] {
    const operations = new Map<string, { durations: number[], count: number }>()

    const tasks = this.getTasks()
    for (const task of tasks) {
      const pairs = new Map<string, { start?: string, end?: string }>()

      for (const entry of task.entries) {
        const msg = entry.message
        const details = entry.details
        const name = details.name || ''
        
        if (msg.includes('.Starting')) {
          const key = `${msg.split('.')[1]}_${name}`
          if (!pairs.has(key)) {
            pairs.set(key, {})
          }
          pairs.get(key)!.start = entry.timestamp
        } else if (msg.includes('.Succeeded') || msg.includes('.Failed')) {
          const key = `${msg.split('.')[1]}_${name}`
          if (pairs.has(key)) {
            pairs.get(key)!.end = entry.timestamp
          }
        }
      }

      // 计算耗时
      for (const [key, { start, end }] of pairs.entries()) {
        if (start && end) {
          const duration = this.calculateDuration(start, end)
          if (duration >= 0) {
            if (!operations.has(key)) {
              operations.set(key, { durations: [], count: 0 })
            }
            const op = operations.get(key)!
            op.durations.push(duration)
            op.count++
          }
        }
      }
    }

    const result: PerformanceData[] = []
    for (const [operation, { durations, count }] of operations.entries()) {
      const totalDuration = durations.reduce((a, b) => a + b, 0)
      result.push({
        operation,
        duration: totalDuration,
        count,
        avgDuration: totalDuration / count
      })
    }

    return result.sort((a, b) => b.duration - a.duration)
  }

  private calculateDuration(start: string, end: string): number {
    try {
      const startMs = new Date(start).getTime()
      const endMs = new Date(end).getTime()
      return (endMs - startMs) / 1000 // 转换为秒
    } catch {
      return -1
    }
  }
}



