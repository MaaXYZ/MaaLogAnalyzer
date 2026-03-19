import { markRaw } from 'vue'
import type { EventNotification, TaskInfo, NodeInfo, RecognitionAttempt } from '../types'
import { StringPool } from './stringPool'

export interface ParseProgress {
  current: number
  total: number
  percentage: number
}

// 事件行正则：提取 timestamp, level, processId, threadId, msg, detailsJson
const EVENT_LINE_REGEX = /^\[([^\]]+)\]\[([^\]]+)\]\[(Px[^\]]+)\]\[(Tx[^\]]+)\].*!!!OnEventNotify!!!\s*\[handle=[^\]]*\]\s*\[msg=([^\]]+)\]\s*\[details=(.*)\]\s*$/

/** FNV-1a hash，将字符串映射为 32 位整数字符串，用于事件去重 key */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/**
 * 子任务事件收集器
 * 统一管理非当前 task_id 的 Recognition/Action/PipelineNode 事件
 */
class SubTaskCollector {
  private recognitions = new Map<number, RecognitionAttempt[]>()
  private actions = new Map<number, any[]>()
  private pipelineNodes = new Map<number, any[]>()

  addRecognition(taskId: number, attempt: RecognitionAttempt): void {
    if (!this.recognitions.has(taskId)) {
      this.recognitions.set(taskId, [])
    }
    this.recognitions.get(taskId)!.push(attempt)
  }

  addAction(taskId: number, action: any): void {
    if (!this.actions.has(taskId)) {
      this.actions.set(taskId, [])
    }
    this.actions.get(taskId)!.push(action)
  }

  addPipelineNode(taskId: number, node: any): void {
    if (!this.pipelineNodes.has(taskId)) {
      this.pipelineNodes.set(taskId, [])
    }
    this.pipelineNodes.get(taskId)!.push(node)
  }

  consumeRecognitions(taskId: number): RecognitionAttempt[] {
    const result = this.recognitions.get(taskId) || []
    this.recognitions.delete(taskId)
    return result
  }

  consumeActions(taskId: number): any[] {
    const result = this.actions.get(taskId) || []
    this.actions.delete(taskId)
    return result
  }

  /** 将收集的子任务 PipelineNode 转换为 NestedActionGroup[] 格式 */
  consumeAsNestedActionGroups(stringPool: StringPool): any[] {
    const groups = Array.from(this.pipelineNodes.entries()).map(([taskId, nodes]) => ({
      task_id: taskId,
      name: stringPool.intern(nodes[0]?.name || 'SubTask'),
      timestamp: stringPool.intern(nodes[0]?.timestamp || ''),
      status: nodes.every((n: any) => n.status === 'success') ? 'success' : 'failed',
      nested_actions: nodes
    }))
    this.pipelineNodes.clear()
    return groups
  }

  clear(): void {
    this.recognitions.clear()
    this.actions.clear()
    this.pipelineNodes.clear()
  }
}

export class LogParser {
  private events: EventNotification[] = []
  private stringPool = new StringPool()
  private taskProcessMap = new Map<number, string>()
  private taskThreadMap = new Map<number, string>()
  private errorImages = new Map<string, string>()
  private visionImages = new Map<string, string>()
  private waitFreezesImages = new Map<string, string>()

  /**
   * 设置错误截图映射
   */
  setErrorImages(images: Map<string, string>): void {
    this.errorImages = images
  }

  /**
   * 设置 vision 调试截图映射
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId
   */
  setVisionImages(images: Map<string, string>): void {
    this.visionImages = images
  }

  /**
   * 设置 wait_freezes 调试截图映射
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes
   */
  setWaitFreezesImages(images: Map<string, string>): void {
    this.waitFreezesImages = images
  }

  /**
   * 解析日志文件内容（异步分块处理）
   * 只处理包含 !!!OnEventNotify!!! 的行
   */
  async parseFile(
    content: string,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<void> {
    this.taskProcessMap.clear()
    this.taskThreadMap.clear()

    const rawLines = content.split('\n')
    const events: EventNotification[] = []
    const seenEvents = new Set<string>()
    const totalLines = rawLines.length
    const chunkSize = 1000

    for (let startIdx = 0; startIdx < totalLines; startIdx += chunkSize) {
      await new Promise(resolve => setTimeout(resolve, 0))

      const endIdx = Math.min(startIdx + chunkSize, totalLines)

      for (let lineNum = startIdx + 1; lineNum <= endIdx; lineNum++) {
        const rawLine = rawLines[lineNum - 1]
        if (!rawLine || !rawLine.includes('!!!OnEventNotify!!!')) continue

        try {
          const event = this.parseEventLine(rawLine.trim(), lineNum)
          if (!event) continue

          // IPC 去重：用 message + details 内容的 hash
          if (!seenEvents.has(event._dedupKey)) {
            seenEvents.add(event._dedupKey)
            events.push(event)

            // 记录任务的进程和线程信息（只记录首次出现，避免 IPC 覆盖）
            if (event.message === 'Tasker.Task.Starting' && event.details.task_id) {
              if (!this.taskProcessMap.has(event.details.task_id)) {
                this.taskProcessMap.set(event.details.task_id, event.processId)
                this.taskThreadMap.set(event.details.task_id, event.threadId)
              }
            }
          }
        } catch (e) {
          console.warn(`解析第 ${lineNum} 行失败:`, e)
        }
      }

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
   * 直接从事件行提取所有需要的字段
   * 格式: [timestamp][level][Pxpid][Txthread][...] !!!OnEventNotify!!! [handle=xxx] [msg=EventName] [details={...json...}]
   */
  private parseEventLine(line: string, lineNum: number): (EventNotification & { processId: string; threadId: string; _dedupKey: string }) | null {
    const match = line.match(EVENT_LINE_REGEX)
    if (!match) return null

    const [, timestamp, level, processId, threadId, msg, detailsJson] = match

    let details: Record<string, any> = {}
    try {
      details = JSON.parse(detailsJson)
    } catch {
      return null
    }

    return {
      timestamp,
      level,
      message: msg,
      details,
      processId,
      threadId,
      _lineNumber: lineNum,
      _dedupKey: `${timestamp.substring(0, 19)}|${msg}|${fnv1aHash(detailsJson)}`
    }
  }

  /**
   * 获取所有任务
   */
  getTasks(): TaskInfo[] {
    const tasks: TaskInfo[] = []

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]
      const { message, details } = event

      if (message === 'Tasker.Task.Starting') {
        const taskId = details.task_id
        const uuid = details.uuid || ''

        const isDuplicate = tasks.some(t =>
          t.uuid === uuid && t.task_id === taskId && !t.end_time
        )

        if (taskId && !isDuplicate) {
          tasks.push({
            task_id: taskId,
            entry: this.stringPool.intern(details.entry || ''),
            hash: this.stringPool.intern(details.hash || ''),
            uuid: this.stringPool.intern(uuid),
            start_time: this.stringPool.intern(event.timestamp),
            status: 'running',
            nodes: [],
            events: [],
            duration: undefined,
            _startEventIndex: i
          })
        }
      } else if (message === 'Tasker.Task.Succeeded' || message === 'Tasker.Task.Failed') {
        const taskId = details.task_id
        const uuid = details.uuid

        let matchedTask = null
        if (uuid && uuid.trim() !== '') {
          matchedTask = tasks.find(t => t.uuid === uuid && !t.end_time)
        } else {
          matchedTask = tasks.find(t => t.task_id === taskId && !t.end_time)
        }

        if (matchedTask) {
          matchedTask.status = message === 'Tasker.Task.Succeeded' ? 'succeeded' : 'failed'
          matchedTask.end_time = this.stringPool.intern(event.timestamp)
          matchedTask._endEventIndex = i

          if (matchedTask.start_time && matchedTask.end_time) {
            const start = new Date(matchedTask.start_time).getTime()
            const end = new Date(matchedTask.end_time).getTime()
            matchedTask.duration = end - start
          }
        }
      }
    }

    for (const task of tasks) {
      task.nodes = this.getTaskNodes(task)
      const taskStartIndex = task._startEventIndex ?? -1
      const taskEndIndex = task._endEventIndex ?? this.events.length - 1
      if (taskStartIndex >= 0) {
        task.events = this.events
          .slice(taskStartIndex, taskEndIndex + 1)
          .filter(event => event.details?.task_id === task.task_id)
      }

      if (task.status === 'running' && task.nodes.length > 0) {
        const lastNode = task.nodes[task.nodes.length - 1]
        const start = new Date(task.start_time).getTime()
        const end = new Date(lastNode.timestamp).getTime()
        task.duration = end - start
      }
    }

    this.events = []
    console.log(`字符串池统计: ${this.stringPool.size()} 个唯一字符串`)
    this.stringPool.clear()

    return tasks.filter(task => task.entry !== 'MaaTaskerPostStop')
  }

  /**
   * 获取任务的所有节点
   */
  private getTaskNodes(task: TaskInfo): NodeInfo[] {
    const nodes: NodeInfo[] = []
    const nodeIdSet = new Set<number>()

    const taskStartIndex = task._startEventIndex ?? -1
    const taskEndIndex = task._endEventIndex ?? this.events.length - 1
    if (taskStartIndex === -1) return []

    const taskEvents = this.events.slice(taskStartIndex, taskEndIndex + 1)

    // 当前节点的累积状态
    let currentNextList: any[] = []
    const recognitionAttempts: RecognitionAttempt[] = []
    const nestedRecognitionNodes: RecognitionAttempt[] = []
    const nestedActionNodes: any[] = []

    // 子任务事件收集器
    const subTasks = new SubTaskCollector()

    for (const event of taskEvents) {
      const { message, details } = event
      const isCurrentTask = details.task_id === task.task_id

      // === 当前任务的事件 ===
      if (isCurrentTask) {
        switch (message) {
          case 'Node.NextList.Starting':
            currentNextList = details.list || []
            break

          case 'Node.Recognition.Succeeded':
          case 'Node.Recognition.Failed':
            recognitionAttempts.push({
              reco_id: details.reco_id,
              name: this.stringPool.intern(details.name || ''),
              timestamp: this.stringPool.intern(event.timestamp),
              status: message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
              reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
              nested_nodes: nestedRecognitionNodes.length > 0 ? nestedRecognitionNodes.slice() : undefined,
              error_image: this.findRecognitionImage(event.timestamp, details.name || ''),
              vision_image: this.findVisionImage(event.timestamp, details.name || '', details.reco_id)
            })
            nestedRecognitionNodes.length = 0
            break

          case 'Node.PipelineNode.Succeeded':
          case 'Node.PipelineNode.Failed': {
            const nodeId = details.node_id
            if (!nodeId || nodeIdSet.has(nodeId)) break

            const nodeName = details.name || ''
            const subTaskActionGroups = subTasks.consumeAsNestedActionGroups(this.stringPool)

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
              recognition_attempts: recognitionAttempts.slice(),
              nested_action_nodes: subTaskActionGroups.length > 0
                ? subTaskActionGroups
                : (nestedActionNodes.length > 0 ? nestedActionNodes.slice() : undefined),
              node_details: details.node_details ? markRaw(details.node_details) : undefined,
              error_image: this.findErrorImage(event.timestamp, nodeName),
              wait_freezes_images: this.findWaitFreezesImages(event.timestamp, details.action_details?.name || details.node_details?.name || nodeName)
            }
            nodes.push(node)
            nodeIdSet.add(nodeId)

            // 如果嵌套动作组中有失败的，节点整体标记为失败
            if (node.status === 'success' && node.nested_action_nodes?.some(g => g.status === 'failed')) {
              node.status = 'failed'
            }

            // 重置当前节点状态
            currentNextList = []
            recognitionAttempts.length = 0
            nestedActionNodes.length = 0
            nestedRecognitionNodes.length = 0
            subTasks.clear()
            break
          }
        }
        continue
      }

      // === 子任务的事件（task_id !== 当前任务） ===
      const subTaskId = details.task_id
      switch (message) {
        case 'Node.Recognition.Succeeded':
        case 'Node.Recognition.Failed':
          subTasks.addRecognition(subTaskId, {
            reco_id: details.reco_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
            error_image: this.findRecognitionImage(event.timestamp, details.name || ''),
            vision_image: this.findVisionImage(event.timestamp, details.name || '', details.reco_id)
          })
          break

        case 'Node.Action.Succeeded':
        case 'Node.Action.Failed':
          subTasks.addAction(subTaskId, {
            action_id: details.action_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.Action.Succeeded' ? 'success' : 'failed',
            action_details: details.action_details ? markRaw(details.action_details) : undefined
          })
          break

        case 'Node.RecognitionNode.Succeeded':
        case 'Node.RecognitionNode.Failed': {
          const nestedRecognitions = subTasks.consumeRecognitions(subTaskId)
          nestedRecognitionNodes.push({
            reco_id: details.reco_details?.reco_id || details.node_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
            nested_nodes: nestedRecognitions.length > 0 ? nestedRecognitions : undefined,
            error_image: this.findRecognitionImage(event.timestamp, details.name || ''),
            vision_image: this.findVisionImage(event.timestamp, details.name || '', details.reco_details?.reco_id || details.node_id)
          })
          break
        }

        case 'Node.ActionNode.Succeeded':
        case 'Node.ActionNode.Failed': {
          const nestedActions = subTasks.consumeActions(subTaskId)
          nestedActionNodes.push({
            action_id: details.action_details?.action_id || details.node_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.ActionNode.Succeeded' ? 'success' : 'failed',
            action_details: details.action_details ? markRaw(details.action_details) : undefined,
            nested_actions: nestedActions.length > 0 ? nestedActions : undefined
          })
          break
        }

        case 'Node.PipelineNode.Succeeded':
        case 'Node.PipelineNode.Failed': {
          const taskRecognitions = subTasks.consumeRecognitions(subTaskId)
          subTasks.addPipelineNode(subTaskId, {
            node_id: details.node_id,
            name: this.stringPool.intern(details.reco_details?.name || details.action_details?.name || details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.PipelineNode.Succeeded' ? 'success' : 'failed',
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
            action_details: details.action_details ? markRaw(details.action_details) : undefined,
            recognition_attempts: taskRecognitions.length > 0 ? taskRecognitions : undefined
          })
          break
        }
      }
    }

    return nodes
  }

  /**
   * 查找识别尝试的截图（匹配到秒级别）
   */
  findRecognitionImage(timestamp: string, nodeName: string): string | undefined {
    if (this.errorImages.size === 0) return undefined

    // 2026-03-09 19:46:35.xxx -> 2026.03.09-19.46.35
    const secondsOnly = timestamp.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/, '$1.$2.$3-$4.$5.$6')
    const suffix = `_${nodeName}`

    for (const [key, path] of this.errorImages.entries()) {
      if (key.includes(`${secondsOnly}.`) && key.endsWith(suffix)) {
        return path
      }
    }
    return undefined
  }

  /**
   * 查找错误截图（匹配到秒级别 + 节点名）
   */
  findErrorImage(timestamp: string, nodeName: string): string | undefined {
    if (this.errorImages.size === 0) return undefined

    // 2026-03-08 13:12:30.216 -> 2026.03.08-13.12.30
    const secondsOnly = timestamp.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/, '$1.$2.$3-$4.$5.$6')
    const suffix = `_${nodeName}`

    for (const [key, path] of this.errorImages.entries()) {
      if (key.includes(`${secondsOnly}.`) && key.endsWith(suffix)) {
        return path
      }
    }
    return undefined
  }

  /**
   * 查找 vision 调试截图（秒级时间戳 + 节点名 + reco_id 三重匹配）
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId
   */
  findVisionImage(timestamp: string, nodeName: string, recoId: number): string | undefined {
    if (this.visionImages.size === 0) return undefined

    // 2026-03-08 13:12:30.216 -> 2026.03.08-13.12.30
    const secondsOnly = timestamp.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/, '$1.$2.$3-$4.$5.$6')
    const suffix = `_${nodeName}_${recoId}`

    for (const [key, path] of this.visionImages.entries()) {
      if (key.includes(`${secondsOnly}.`) && key.endsWith(suffix)) {
        return path
      }
    }
    return undefined
  }

  /**
   * 查找 action 的 wait_freezes 调试截图（按节点名匹配，返回所有匹配的图片）
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes
   * 匹配逻辑：节点名一致，且时间戳在节点完成前（同分钟或前几分钟）
   */
  private findWaitFreezesImages(nodeTimestamp: string, actionName: string): string[] | undefined {
    if (this.waitFreezesImages.size === 0) return undefined

    const suffix = `_${actionName}_wait_freezes`
    const results: string[] = []

    // 节点完成时间（毫秒）
    const nodeTime = new Date(nodeTimestamp).getTime()
    if (isNaN(nodeTime)) return undefined

    for (const [key, path] of this.waitFreezesImages.entries()) {
      if (!key.endsWith(suffix)) continue

      // 从 key 中提取时间戳: 2026.03.11-06.22.54.365_NodeName_wait_freezes
      // -> 2026-03-11 06:22:54.365
      const tsMatch = key.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d{1,3})_/)
      if (!tsMatch) continue
      const [, y, mo, d, h, mi, s, ms] = tsMatch
      const imgTime = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.${ms.padEnd(3, '0')}`).getTime()

      // wait_freezes 截图应该在节点完成前、且不超过60秒
      if (!isNaN(imgTime) && imgTime <= nodeTime && nodeTime - imgTime < 60000) {
        results.push(path)
      }
    }

    return results.length > 0 ? results : undefined
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
    return Array.from(new Set(this.taskProcessMap.values())).sort()
  }

  /**
   * 获取所有唯一的线程ID（已排序）
   */
  getThreadIds(): string[] {
    return Array.from(new Set(this.taskThreadMap.values())).sort()
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
