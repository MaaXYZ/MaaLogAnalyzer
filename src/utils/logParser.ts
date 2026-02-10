import { markRaw } from 'vue'
import type { LogLine, EventNotification, TaskInfo, NodeInfo } from '../types'
import { StringPool } from './stringPool'

export interface ParseProgress {
  current: number
  total: number
  percentage: number
}

export class LogParser {
  private events: EventNotification[] = []
  private stringPool = new StringPool()
  private processIds = new Set<string>()
  private threadIds = new Set<string>()
  private taskProcessMap = new Map<number, string>()
  private taskThreadMap = new Map<number, string>()

  /**
   * 解析日志文件内容（异步分块处理）
   */
  async parseFile(
    content: string,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<void> {
    // 清空集合，确保每次解析都是全新的状态
    this.processIds.clear()
    this.threadIds.clear()
    this.taskProcessMap.clear()
    this.taskThreadMap.clear()

    const rawLines = content.split('\n')
    const events: EventNotification[] = []
    const totalLines = rawLines.length
    const chunkSize = 1000 // 每次处理 1000 行

    // 分块处理
    for (let startIdx = 0; startIdx < totalLines; startIdx += chunkSize) {
      // 让出主线程，保持 UI 响应
      await new Promise(resolve => setTimeout(resolve, 0))

      const endIdx = Math.min(startIdx + chunkSize, totalLines)

      // 处理当前块
      for (let lineNum = startIdx + 1; lineNum <= endIdx; lineNum++) {
        const rawLine = rawLines[lineNum - 1].trim()
        if (!rawLine) continue

        try {
          const parsed = this.parseLine(rawLine, lineNum)
          if (parsed) {
            // 只提取事件通知，不存储所有行
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

      // 报告进度
      if (onProgress) {
        onProgress({
          current: endIdx,
          total: totalLines,
          percentage: Math.round((endIdx / totalLines) * 100)
        })
      }
    }

    this.events = events
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

    // 收集唯一的进程ID和线程ID
    this.processIds.add(processId)
    this.threadIds.add(threadId)

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
    const { message, params, processId, threadId } = logLine

    if (!message.includes('!!!OnEventNotify!!!')) {
      return null
    }

    // 提取 msg 和 details
    const msg = params['msg']
    const details = params['details']

    if (!msg) {
      return null
    }

    // 当解析到任务开始事件时，记录任务的进程和线程信息
    // 只记录第一次遇到的任务，避免IPC事件覆盖主进程信息
    if (msg === 'Tasker.Task.Starting' && details.task_id) {
      if (!this.taskProcessMap.has(details.task_id)) {
        this.taskProcessMap.set(details.task_id, processId)
        this.taskThreadMap.set(details.task_id, threadId)
      }
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
    const tasks: TaskInfo[] = []
    const taskMap = new Map<string, TaskInfo>() // 用于去重，避免IPC导致的重复任务（使用uuid+task_id作为key）

    // 遍历所有事件，提取任务信息
    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]
      const { message, details } = event

      if (message === 'Tasker.Task.Starting') {
        const taskId = details.task_id
        const uuid = details.uuid || ''
        // 使用uuid+task_id作为唯一标识，支持task_id在不同controller间重用
        const taskKey = `${uuid}_${taskId}`
        if (taskId && !taskMap.has(taskKey)) {
          const task = {
            task_id: taskId,
            entry: this.stringPool.intern(details.entry || ''),
            hash: this.stringPool.intern(details.hash || ''),
            uuid: this.stringPool.intern(uuid),
            start_time: this.stringPool.intern(event.timestamp),
            status: 'running' as const,
            nodes: [],
            events: [], // 不再存储事件，节省内存
            duration: undefined,
            _startEventIndex: i
          }
          tasks.push(task)
          taskMap.set(taskKey, task)
        }
      } else if (message === 'Tasker.Task.Succeeded' || message === 'Tasker.Task.Failed') {
        const taskId = details.task_id
        const uuid = details.uuid

        // 优先使用 uuid 匹配（如果存在且不为空），否则使用 task_id + FIFO
        let matchedTask = null
        if (uuid && uuid.trim() !== '') {
          // 使用 uuid 精确匹配
          matchedTask = tasks.find(t => t.uuid === uuid && !t.end_time)
        } else {
          // 使用 task_id + FIFO 匹配（找第一个未结束的匹配任务）
          matchedTask = tasks.find(t => t.task_id === taskId && !t.end_time)
        }

        if (matchedTask) {
          matchedTask.status = message === 'Tasker.Task.Succeeded' ? 'succeeded' : 'failed'
          matchedTask.end_time = this.stringPool.intern(event.timestamp)
          // 不再存储事件
          matchedTask._endEventIndex = i

          // 计算持续时间
          if (matchedTask.start_time && matchedTask.end_time) {
            const start = new Date(matchedTask.start_time).getTime()
            const end = new Date(matchedTask.end_time).getTime()
            matchedTask.duration = end - start
          }
        }
      }
    }

    // 为每个任务提取节点信息
    for (const task of tasks) {
      task.nodes = this.getTaskNodes(task)

      // 为运行中的任务计算耗时（使用最后一个节点的时间戳）
      if (task.status === 'running' && task.nodes.length > 0) {
        const lastNode = task.nodes[task.nodes.length - 1]
        const start = new Date(task.start_time).getTime()
        const end = new Date(lastNode.timestamp).getTime()
        task.duration = end - start
      }
    }

    // 清除事件数组，释放内存
    this.events = []

    // 清空字符串池（字符串已经被引用，池本身不再需要）
    console.log(`字符串池统计: ${this.stringPool.size()} 个唯一字符串`)
    this.stringPool.clear()

    // 过滤掉系统任务 MaaTaskerPostStop
    return tasks.filter(task => task.entry !== 'MaaTaskerPostStop')
  }

  /**
   * 获取任务的所有节点
   */
  private getTaskNodes(task: TaskInfo): NodeInfo[] {
    const nodes: NodeInfo[] = []
    const nodeIdSet = new Set<number>() // 用于去重，避免IPC导致的重复节点

    // 使用已记录的事件索引来确定任务范围
    const taskStartIndex = task._startEventIndex ?? -1
    const taskEndIndex = task._endEventIndex ?? this.events.length - 1

    if (taskStartIndex === -1) {
      return []
    }

    // 只处理任务范围内的事件
    const taskEvents = this.events.slice(taskStartIndex, taskEndIndex + 1)

    // 收集识别尝试历史
    const recognitionAttempts: any[] = []
    // 临时存储嵌套的 RecognitionNode 事件
    const nestedNodes: any[] = []
    // 临时存储嵌套的 ActionNode 事件
    const nestedActionNodes: any[] = []
    // 临时存储当前节点的 NextList（在 PipelineNode.Starting 和 Succeeded 之间）
    let currentNextList: any[] = []
    // 存储每个 task_id 的 Recognition 事件（用于嵌套节点）
    const recognitionsByTaskId = new Map<number, any[]>()
    // 存储每个 task_id 的 Action 事件（用于嵌套节点）
    const actionsByTaskId = new Map<number, any[]>()

    // 遍历任务范围内的事件，提取节点信息和识别历史
    for (const event of taskEvents) {
      const { message, details } = event

      // 收集 NextList 事件，存储为当前节点的 next_list
      if ((message === 'Node.NextList.Starting' || message === 'Node.NextList.Succeeded')
          && details.task_id === task.task_id) {
        // NextList.Starting 提供当前节点要尝试识别的节点列表
        if (message === 'Node.NextList.Starting') {
          currentNextList = details.list || []
        }
      }

      // 收集嵌套的 RecognitionNode 事件（这些节点有独立的 task_id）
      // 只收集非当前任务的 RecognitionNode（即 custom recognition/action 产生的子任务）
      if ((message === 'Node.RecognitionNode.Succeeded' || message === 'Node.RecognitionNode.Failed')) {
        const taskId = details.task_id

        // 只收集子任务的 RecognitionNode 事件
        if (taskId !== task.task_id) {
          // 获取该 task_id 的 Recognition 事件列表
          const nestedRecognitions = recognitionsByTaskId.get(taskId) || []

          const nestedNode = {
            reco_id: details.reco_details?.reco_id || details.node_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
            nested_nodes: nestedRecognitions.length > 0 ? nestedRecognitions : undefined
          }
          nestedNodes.push(nestedNode)

          // 清空该 task_id 的 Recognition 事件列表
          recognitionsByTaskId.delete(taskId)
        }
      }

      // 收集嵌套的 ActionNode 事件（这些节点有独立的 task_id）
      // 只收集非当前任务的 ActionNode（即 custom action 产生的子任务）
      if ((message === 'Node.ActionNode.Succeeded' || message === 'Node.ActionNode.Failed')) {
        const taskId = details.task_id

        // 只收集子任务的 ActionNode 事件
        if (taskId !== task.task_id) {
          // 获取该 task_id 的 Action 事件列表
          const nestedActions = actionsByTaskId.get(taskId) || []

          const nestedActionNode = {
            action_id: details.action_details?.action_id || details.node_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.ActionNode.Succeeded' ? 'success' : 'failed',
            action_details: details.action_details ? markRaw(details.action_details) : undefined,
            nested_actions: nestedActions.length > 0 ? nestedActions : undefined
          }
          nestedActionNodes.push(nestedActionNode)

          // 清空该 task_id 的 Action 事件列表
          actionsByTaskId.delete(taskId)
        }
      }

      // 收集识别事件（所有 task_id）
      if ((message === 'Node.Recognition.Succeeded' || message === 'Node.Recognition.Failed')) {
        const taskId = details.task_id

        // 如果是当前任务的识别事件，附加嵌套节点并添加到 recognitionAttempts
        if (taskId === task.task_id) {
          const attempt = {
            reco_id: details.reco_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
            nested_nodes: nestedNodes.length > 0 ? nestedNodes.slice() : undefined
          }
          recognitionAttempts.push(attempt)
          // 清空嵌套节点数组
          nestedNodes.length = 0
        } else {
          // 如果是子任务的识别事件，存储到对应的 task_id 列表中
          const attempt = {
            reco_id: details.reco_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined
          }
          if (!recognitionsByTaskId.has(taskId)) {
            recognitionsByTaskId.set(taskId, [])
          }
          recognitionsByTaskId.get(taskId)!.push(attempt)
        }
      }

      // 收集动作事件（所有 task_id）
      if ((message === 'Node.Action.Succeeded' || message === 'Node.Action.Failed')) {
        const taskId = details.task_id

        // 如果是子任务的动作事件，存储到对应的 task_id 列表中
        if (taskId !== task.task_id) {
          const actionAttempt = {
            action_id: details.action_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.Action.Succeeded' ? 'success' : 'failed',
            action_details: details.action_details ? markRaw(details.action_details) : undefined
          }
          if (!actionsByTaskId.has(taskId)) {
            actionsByTaskId.set(taskId, [])
          }
          actionsByTaskId.get(taskId)!.push(actionAttempt)
        }
      }

      // 当遇到 PipelineNode.Succeeded 或 Failed 时，创建节点并关联识别历史
      if ((message === 'Node.PipelineNode.Succeeded' || message === 'Node.PipelineNode.Failed')
          && details.task_id === task.task_id) {
        const nodeId = details.node_id

        // 只在节点不存在时才创建，避免IPC事件导致重复
        if (nodeId && !nodeIdSet.has(nodeId)) {
          // 优先使用 node_details.name（实际执行的节点名称）
          // 如果没有，再使用 details.name（上下文节点名称）
          const nodeName = details.node_details?.name || details.name || ''

          // 获取自上一个 PipelineNode 以来收集的所有识别尝试
          // （包括常规 Recognition 事件和嵌套的 RecognitionNode 事件）
          const nodeRecognitionAttempts = recognitionAttempts.slice()

          const node: NodeInfo = {
            node_id: nodeId,
            name: this.stringPool.intern(nodeName),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.PipelineNode.Succeeded' ? 'success' : 'failed',
            task_id: task.task_id,
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
            action_details: details.action_details ? markRaw(details.action_details) : undefined,
            focus: details.focus ? markRaw(details.focus) : undefined,
            next_list: currentNextList.map((item: any) => ({
              name: this.stringPool.intern(item.name || ''),
              anchor: item.anchor || false,
              jump_back: item.jump_back || false
            })),
            recognition_attempts: nodeRecognitionAttempts,
            nested_action_nodes: nestedActionNodes.length > 0 ? nestedActionNodes.slice() : undefined,
            nested_recognition_in_action: nestedNodes.length > 0 ? nestedNodes.slice() : undefined,
            node_details: details.node_details ? markRaw(details.node_details) : undefined
          }
          nodes.push(node)
          nodeIdSet.add(nodeId)
        }

        // 清空已使用的数据，准备处理下一个节点
        currentNextList = []
        recognitionAttempts.length = 0
        nestedActionNodes.length = 0
        nestedNodes.length = 0
      }
    }

    return nodes
  }


  /**
   * 获取所有事件
   */
  getEvents(): EventNotification[] {
    return this.events
  }

  /**
   * 获取所有唯一的进程ID（已排序）
   */
  getProcessIds(): string[] {
    // 只返回有任务的进程ID
    const processIdsWithTasks = new Set(this.taskProcessMap.values())
    return Array.from(processIdsWithTasks).sort()
  }

  /**
   * 获取所有唯一的线程ID（已排序）
   */
  getThreadIds(): string[] {
    // 只返回有任务的线程ID
    const threadIdsWithTasks = new Set(this.taskThreadMap.values())
    return Array.from(threadIdsWithTasks).sort()
  }

  /**
   * 获取指定任务的进程ID
   */
  getTaskProcessId(taskId: number): string | undefined {
    return this.taskProcessMap.get(taskId)
  }

  /**
   * 获取指定任务的线程ID
   */
  getTaskThreadId(taskId: number): string | undefined {
    return this.taskThreadMap.get(taskId)
  }
}
