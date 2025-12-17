import type { LogLine, EventNotification, TaskInfo, NodeInfo, Statistics } from '../types'

export class LogParser {
  private lines: LogLine[] = []
  private events: EventNotification[] = []

  /**
   * 解析日志文件内容
   */
  parseFile(content: string): LogLine[] {
    const rawLines = content.split('\n')
    const lines: LogLine[] = []
    const events: EventNotification[] = []

    for (let lineNum = 1; lineNum <= rawLines.length; lineNum++) {
      const rawLine = rawLines[lineNum - 1].trim()
      if (!rawLine) continue

      try {
        const parsed = this.parseLine(rawLine, lineNum)
        if (parsed) {
          lines.push(parsed)

          // 检查是否是事件通知
          if (rawLine.includes('!!!OnEventNotify!!!')) {
            const event = this.parseEventNotification(parsed)
            if (event) {
              events.push(event)
            }
          }
        }
      } catch (e) {
        console.warn(`解析第 ${lineNum} 行失败:`, e)
      }
    }

    this.lines = lines
    this.events = events
    return lines
  }

  /**
   * 解析单行日志
   * 格式: [时间戳][级别][进程ID][线程ID][源文件][行号][函数名]消息 [参数] | 状态,耗时
   */
  private parseLine(line: string, lineNum: number): LogLine | null {
    // 正则表达式匹配日志格式
    const regex = /^\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?(?:\[([^\]]+)\])?(?:\[([^\]]+)\])?\s*(.*)$/
    const match = line.match(regex)

    if (!match) {
      return null
    }

    const [, timestamp, level, processId, threadId, part1, part2, part3, rest] = match

    // 判断可选部分是源文件、行号还是函数名
    let sourceFile: string | undefined
    let lineNumber: string | undefined
    let functionName: string | undefined
    let message = rest

    // 根据模式判断：
    // 如果有3个可选部分，通常是 [源文件][行号][函数名]
    // 如果只有1个可选部分，通常是 [模块名]
    if (part3) {
      sourceFile = part1
      lineNumber = part2
      functionName = part3
    } else if (part1 && !part2) {
      // 只有一个可选部分，可能是模块名或函数名
      if (part1.includes('.cpp') || part1.includes('.h')) {
        sourceFile = part1
      } else {
        functionName = part1
      }
    } else if (part1 && part2) {
      sourceFile = part1
      lineNumber = part2
    }

    // 解析消息和参数
    const { message: cleanMessage, params, status, duration } = this.parseMessageAndParams(message)

    return {
      timestamp,
      level: level as any,
      processId,
      threadId,
      sourceFile,
      lineNumber,
      functionName,
      message: cleanMessage,
      params,
      status,
      duration,
      _lineNumber: lineNum
    }
  }

  /**
   * 解析消息内容和参数
   */
  private parseMessageAndParams(message: string): {
    message: string
    params: Record<string, any>
    status?: 'enter' | 'leave'
    duration?: number
  } {
    const params: Record<string, any> = {}
    let status: 'enter' | 'leave' | undefined
    let duration: number | undefined

    // 智能提取参数 [key=value] 或 [key]，考虑嵌套的方括号和花括号
    const extractedParams: string[] = []
    let i = 0
    while (i < message.length) {
      if (message[i] === '[') {
        // 找到参数的开始
        let depth = 1
        let braceDepth = 0
        let j = i + 1

        // 跟踪嵌套的方括号和花括号
        while (j < message.length && (depth > 0 || braceDepth > 0)) {
          if (message[j] === '{') {
            braceDepth++
          } else if (message[j] === '}') {
            braceDepth--
          } else if (message[j] === '[' && braceDepth === 0) {
            depth++
          } else if (message[j] === ']' && braceDepth === 0) {
            depth--
          }
          j++
        }

        if (depth === 0) {
          // 找到匹配的右括号
          const param = message.substring(i + 1, j - 1)
          extractedParams.push(param)
          i = j
        } else {
          i++
        }
      } else {
        i++
      }
    }

    // 解析提取的参数
    for (const param of extractedParams) {
      // 解析 key=value 格式
      const kvMatch = param.match(/^([^=]+)=(.+)$/)
      if (kvMatch) {
        const [, key, value] = kvMatch
        params[key.trim()] = this.parseValue(value.trim())
      } else {
        // 单独的标记
        params[param.trim()] = true
      }
    }

    // 移除参数部分，保留主消息
    let cleanMessage = message
    for (const param of extractedParams) {
      cleanMessage = cleanMessage.replace(`[${param}]`, '')
    }
    cleanMessage = cleanMessage.trim()

    // 检查是否有 | enter 或 | leave
    const statusMatch = cleanMessage.match(/\|\s*(enter|leave)(?:,\s*(\d+)ms)?/)
    if (statusMatch) {
      status = statusMatch[1] as 'enter' | 'leave'
      if (statusMatch[2]) {
        duration = parseInt(statusMatch[2])
      }
      cleanMessage = cleanMessage.replace(/\|\s*(enter|leave).*$/, '').trim()
    }

    return { message: cleanMessage, params, status, duration }
  }

  /**
   * 解析参数值
   */
  private parseValue(value: string): any {
    // 尝试解析 JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }

    // 尝试解析布尔值
    if (value === 'true') return true
    if (value === 'false') return false

    // 尝试解析数字
    if (/^-?\d+$/.test(value)) {
      return parseInt(value)
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value)
    }

    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1)
    }

    return value
  }

  /**
   * 解析事件通知
   */
  private parseEventNotification(logLine: LogLine): EventNotification | null {
    const { message, params } = logLine

    if (!message.includes('!!!OnEventNotify!!!')) {
      return null
    }

    // 提取 msg 和 details
    const msg = params['msg']
    const details = params['details']

    if (!msg) {
      return null
    }

    return {
      timestamp: logLine.timestamp,
      level: logLine.level,
      message: msg,
      details: details || {},
      _lineNumber: logLine._lineNumber
    }
  }

  /**
   * 获取所有任务
   */
  getTasks(): TaskInfo[] {
    const tasksMap = new Map<number, TaskInfo>()

    // 遍历所有事件，提取任务信息
    for (const event of this.events) {
      const { message, details } = event

      if (message === 'Tasker.Task.Starting') {
        const taskId = details.task_id
        if (taskId) {
          tasksMap.set(taskId, {
            task_id: taskId,
            entry: details.entry || '',
            hash: details.hash || '',
            uuid: details.uuid || '',
            start_time: event.timestamp,
            status: 'running',
            nodes: [],
            events: [event],
            duration: undefined
          })
        }
      } else if (message === 'Tasker.Task.Succeeded' || message === 'Tasker.Task.Failed') {
        const taskId = details.task_id
        if (taskId && tasksMap.has(taskId)) {
          const task = tasksMap.get(taskId)!
          task.status = message === 'Tasker.Task.Succeeded' ? 'succeeded' : 'failed'
          task.end_time = event.timestamp
          task.events.push(event)

          // 计算持续时间
          if (task.start_time && task.end_time) {
            const start = new Date(task.start_time).getTime()
            const end = new Date(task.end_time).getTime()
            task.duration = end - start
          }
        }
      }
    }

    // 为每个任务提取节点信息
    for (const task of tasksMap.values()) {
      task.nodes = this.getTaskNodes(task)
    }

    return Array.from(tasksMap.values())
  }

  /**
   * 获取任务的所有节点
   */
  private getTaskNodes(task: TaskInfo): NodeInfo[] {
    const nodes: NodeInfo[] = []

    // 找到任务的开始和结束事件索引，只处理任务范围内的事件
    let taskStartIndex = -1
    let taskEndIndex = -1

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]
      if (event.message === 'Tasker.Task.Starting' && event.details.task_id === task.task_id) {
        taskStartIndex = i
      }
      if ((event.message === 'Tasker.Task.Succeeded' || event.message === 'Tasker.Task.Failed')
          && event.details.task_id === task.task_id) {
        taskEndIndex = i
        break
      }
    }

    if (taskStartIndex === -1) {
      return []
    }

    // 如果任务还没有结束，使用所有剩余的事件
    if (taskEndIndex === -1) {
      taskEndIndex = this.events.length - 1
    }

    // 只处理任务范围内的事件
    const taskEvents = this.events.slice(taskStartIndex, taskEndIndex + 1)

    // 收集识别尝试历史
    const recognitionAttempts: any[] = []
    // 临时存储嵌套的 RecognitionNode 事件
    const nestedNodes: any[] = []
    // 当前的 Next 列表（最近遇到的 NextList 事件）
    let currentNextList: any[] = []

    // 遍历任务范围内的事件，提取节点信息和识别历史
    for (const event of taskEvents) {
      const { message, details } = event

      // 收集 NextList 事件，更新当前的 Next 列表
      if ((message === 'Node.NextList.Starting' || message === 'Node.NextList.Succeeded')
          && details.task_id === task.task_id) {
        const list = details.list || []
        // 使用 Succeeded 事件的数据优先，如果是 Starting 则暂存
        if (message === 'Node.NextList.Succeeded') {
          currentNextList = list
        } else if (message === 'Node.NextList.Starting') {
          // 如果还没有 Succeeded 事件，先使用 Starting 的数据
          currentNextList = list
        }
      }

      // 收集嵌套的 RecognitionNode 事件（这些节点有独立的 task_id）
      if ((message === 'Node.RecognitionNode.Succeeded' || message === 'Node.RecognitionNode.Failed')) {
        const nestedNode = {
          reco_id: details.reco_details?.reco_id || details.node_id,
          name: details.name || '',
          timestamp: event.timestamp,
          status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
          reco_details: details.reco_details
        }
        nestedNodes.push(nestedNode)
      }

      // 收集识别事件（普通识别）
      if ((message === 'Node.Recognition.Succeeded' || message === 'Node.Recognition.Failed')
          && details.task_id === task.task_id) {
        // 创建识别尝试，并附加之前收集的嵌套节点
        const attempt = {
          reco_id: details.reco_id,
          name: details.name || '',
          timestamp: event.timestamp,
          status: message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
          reco_details: details.reco_details,
          nested_nodes: nestedNodes.length > 0 ? nestedNodes.slice() : undefined
        }
        recognitionAttempts.push(attempt)
        // 清空嵌套节点数组
        nestedNodes.length = 0
      }

      // 当遇到 PipelineNode.Succeeded 时，创建节点并关联识别历史
      if (message === 'Node.PipelineNode.Succeeded' && details.task_id === task.task_id) {
        // 使用 node_details.name 作为节点名称（当前执行的节点）
        // details.name 是父节点/上下文节点的名称
        const nodeName = details.node_details?.name || details.name || ''
        // 使用当前的 Next 列表（最近遇到的 NextList 事件）
        const nextList = currentNextList.slice()

        // 获取自上一个 PipelineNode 以来收集的所有识别尝试
        // （包括常规 Recognition 事件和嵌套的 RecognitionNode 事件）
        const nodeRecognitionAttempts = recognitionAttempts.slice()

        const node: NodeInfo = {
          node_id: details.node_id,
          name: nodeName,
          timestamp: event.timestamp,
          status: 'success',
          task_id: task.task_id,
          reco_details: details.reco_details,
          action_details: details.action_details,
          focus: details.focus,
          next_list: nextList.map((item: any) => ({
            name: item.name || '',
            anchor: item.anchor || false,
            jump_back: item.jump_back || false
          })),
          recognition_attempts: nodeRecognitionAttempts,
          node_details: details.node_details
        }
        nodes.push(node)

        // 清空已使用的识别尝试
        recognitionAttempts.length = 0
      }
    }

    return nodes
  }

  /**
   * 获取统计信息
   */
  getStatistics(): Statistics {
    const logLevels: Record<string, number> = {}
    const eventTypes: Record<string, number> = {}

    // 统计日志级别
    for (const line of this.lines) {
      logLevels[line.level] = (logLevels[line.level] || 0) + 1
    }

    // 统计事件类型
    for (const event of this.events) {
      eventTypes[event.message] = (eventTypes[event.message] || 0) + 1
    }

    // 获取时间范围
    const timestamps = this.lines.map(l => l.timestamp).filter(t => t)
    const tasks = this.getTasks()

    return {
      totalLines: this.lines.length,
      totalEvents: this.events.length,
      logLevels,
      eventTypes,
      tasks: tasks.length,
      nodes: tasks.reduce((sum, task) => sum + task.nodes.length, 0),
      timeRange: {
        start: timestamps[0] || '',
        end: timestamps[timestamps.length - 1] || ''
      }
    }
  }

  /**
   * 获取所有事件
   */
  getEvents(): EventNotification[] {
    return this.events
  }

  /**
   * 获取所有日志行
   */
  getLines(): LogLine[] {
    return this.lines
  }
}
