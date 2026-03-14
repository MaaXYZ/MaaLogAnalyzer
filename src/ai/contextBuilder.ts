import type { EventNotification, TaskInfo } from '../types'
import { searchKnowledge } from './knowledge'

export interface AiLoadedTarget {
  id: string
  label: string
  fileName: string
  content: string
}

export interface BuildAiContextInput {
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  question: string
  loadedTargets?: AiLoadedTarget[]
  loadedDefaultTargetId?: string
  includeKnowledgePack: boolean
  includeSignalLines: boolean
}

interface SignalLineItem {
  line: number
  text: string
}

const truncate = (value: string, max = 260): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

const pickBestTarget = (targets: AiLoadedTarget[], preferredId = ''): AiLoadedTarget | null => {
  if (targets.length === 0) return null
  if (preferredId) {
    const preferred = targets.find(item => item.id === preferredId)
    if (preferred) return preferred
  }

  const order = ['maafw.log', 'maa.log', 'maafw.bak.log', 'maa.bak.log']
  for (const key of order) {
    const found = targets.find(item => item.fileName.toLowerCase().endsWith(key) || item.label.toLowerCase().endsWith(key))
    if (found) return found
  }

  return targets[0]
}

const pickDetailsSubset = (details: Record<string, unknown>): Record<string, unknown> => {
  const keys = ['name', 'task_id', 'node_id', 'reco_id', 'action_id', 'entry', 'status', 'error', 'reason', 'uuid', 'hash', 'list', 'focus']
  const next: Record<string, unknown> = {}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(details, key)) {
      next[key] = details[key]
    }
  }
  return next
}

const summarizeEvent = (event: EventNotification) => ({
  time: event.timestamp,
  msg: event.message,
  details: pickDetailsSubset(event.details),
})

const collectFailureNodes = (task: TaskInfo | null, limit = 24) => {
  if (!task) return []

  const rows: Array<Record<string, unknown>> = []
  for (const node of task.nodes) {
    let reason = ''
    if (node.status === 'failed') {
      reason = 'node_failed'
    } else if (node.recognition_attempts.some(item => item.status === 'failed')) {
      reason = 'recognition_failed'
    }

    if (!reason) continue

    const lastReco = [...node.recognition_attempts].reverse().find(item => item.status === 'failed')
    rows.push({
      node_id: node.node_id,
      node: node.name,
      status: node.status,
      reason,
      reco: lastReco ? { name: lastReco.name, reco_id: lastReco.reco_id, status: lastReco.status } : null,
      next_list: node.next_list.map(item => ({
        name: item.name,
        anchor: item.anchor,
        jump_back: item.jump_back,
      })),
    })

    if (rows.length >= limit) break
  }

  return rows
}

const collectSignalLines = (target: AiLoadedTarget, maxHits = 24, maxOutput = 60): SignalLineItem[] => {
  const lines = target.content.split(/\r?\n/)
  const hitIndexes: number[] = []

  for (let i = 0; i < lines.length; i += 1) {
    if (/\[(ERR|WRN)\]/.test(lines[i])) {
      hitIndexes.push(i)
    }
  }

  if (hitIndexes.length === 0) return []

  const chosen = hitIndexes.slice(-maxHits)
  const expanded = new Set<number>()
  for (const index of chosen) {
    if (index > 0) expanded.add(index - 1)
    expanded.add(index)
    if (index + 1 < lines.length) expanded.add(index + 1)
  }

  const ordered = Array.from(expanded).sort((a, b) => a - b)
  const output: SignalLineItem[] = []
  for (const index of ordered) {
    output.push({
      line: index + 1,
      text: truncate(lines[index]),
    })
    if (output.length >= maxOutput) break
  }

  return output
}

const buildKnowledgeDigest = (question: string, task: TaskInfo | null) => {
  const tokens = [question]
  if (task) {
    tokens.push(task.entry)
    for (const node of task.nodes) {
      if (node.status === 'failed') tokens.push(node.name)
      for (const attempt of node.recognition_attempts) {
        if (attempt.status === 'failed') tokens.push(attempt.name)
      }
      if (tokens.length > 30) break
    }
  }

  const query = tokens.join(' ')
  return searchKnowledge(query, 8).map(card => ({
    id: card.id,
    title: card.title,
    rule: card.rule,
  }))
}

export function buildAiAnalysisContext(input: BuildAiContextInput): Record<string, unknown> {
  const selectedTask = input.selectedTask

  const taskOverview = input.tasks.slice(-16).map(task => ({
    task_id: task.task_id,
    entry: task.entry,
    status: task.status,
    duration: task.duration,
    nodeCount: task.nodes.length,
    start: task.start_time,
    end: task.end_time,
  }))

  const selectedNodeTimeline = selectedTask
    ? selectedTask.nodes.slice(-80).map(node => ({
      node_id: node.node_id,
      name: node.name,
      status: node.status,
      timestamp: node.timestamp,
      recognition: node.recognition_attempts.map(item => ({
        reco_id: item.reco_id,
        name: item.name,
        status: item.status,
      })),
      next_list: node.next_list.map(item => ({
        name: item.name,
        anchor: item.anchor,
        jump_back: item.jump_back,
      })),
    }))
    : []

  const selectedEventTail = selectedTask
    ? selectedTask.events.slice(-40).map(summarizeEvent)
    : []

  const failureCandidates = collectFailureNodes(selectedTask)

  const bestTarget = input.includeSignalLines ? pickBestTarget(input.loadedTargets ?? [], input.loadedDefaultTargetId) : null
  const signalLines = bestTarget
    ? {
        target: bestTarget.fileName || bestTarget.label,
        lines: collectSignalLines(bestTarget),
      }
    : null

  const knowledge = input.includeKnowledgePack ? buildKnowledgeDigest(input.question, selectedTask) : []

  return {
    generatedAt: new Date().toISOString(),
    question: input.question,
    selectedTask: selectedTask
      ? {
          task_id: selectedTask.task_id,
          entry: selectedTask.entry,
          status: selectedTask.status,
          duration: selectedTask.duration,
          nodeCount: selectedTask.nodes.length,
          start: selectedTask.start_time,
          end: selectedTask.end_time,
        }
      : null,
    taskOverview,
    selectedNodeTimeline,
    selectedEventTail,
    failureCandidates,
    signalLines,
    knowledge,
  }
}
