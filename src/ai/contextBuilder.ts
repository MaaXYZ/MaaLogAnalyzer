import type { EventNotification, TaskInfo } from '../types'
import { maaKnowledgePack, searchKnowledge } from './knowledge'

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
  includeKnowledgeBootstrap?: boolean
  includeSignalLines: boolean
}

interface SignalLineItem {
  line: number
  text: string
}

interface TimelineRecoItem {
  reco_id: number
  name: string
  status: 'success' | 'failed'
}

interface TimelineNextItem {
  name: string
  anchor: boolean
  jump_back: boolean
}

interface TimelineNodeItem {
  node_id: number
  name: string
  status: 'success' | 'failed'
  timestamp: string
  recognition: TimelineRecoItem[]
  next_list: TimelineNextItem[]
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

const buildKnowledgeBootstrap = () => {
  return maaKnowledgePack.cards.map(card => ({
    id: card.id,
    topic: card.topic,
    title: card.title,
    rule: card.rule,
  }))
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

const toTimestampMs = (timestamp: string): number | null => {
  if (!timestamp) return null
  const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T')
  const value = new Date(normalized).getTime()
  return Number.isNaN(value) ? null : value
}

const extractRecoId = (text: string): number | null => {
  const match = text.match(/reco_id[=:" ]+(\d+)/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

const buildTimelineDiagnostics = (timeline: TimelineNodeItem[]) => {
  const byNodeName = new Map<string, {
    name: string
    occurrences: number
    firstTs: number | null
    lastTs: number | null
    failedRecoCount: number
    successRecoCount: number
    failedNodeCount: number
    jumpBackBranches: number
    totalBranches: number
    terminalCount: number
  }>()

  const recoByName = new Map<string, {
    name: string
    total: number
    failed: number
    success: number
    nodes: Set<string>
  }>()

  const recoIdToName = new Map<number, string>()

  for (const node of timeline) {
    const ts = toTimestampMs(node.timestamp)
    const nodeStats = byNodeName.get(node.name) ?? {
      name: node.name,
      occurrences: 0,
      firstTs: ts,
      lastTs: ts,
      failedRecoCount: 0,
      successRecoCount: 0,
      failedNodeCount: 0,
      jumpBackBranches: 0,
      totalBranches: 0,
      terminalCount: 0,
    }

    nodeStats.occurrences += 1
    if (ts != null) {
      if (nodeStats.firstTs == null || ts < nodeStats.firstTs) nodeStats.firstTs = ts
      if (nodeStats.lastTs == null || ts > nodeStats.lastTs) nodeStats.lastTs = ts
    }

    if (node.status === 'failed') nodeStats.failedNodeCount += 1
    nodeStats.totalBranches += node.next_list.length
    nodeStats.jumpBackBranches += node.next_list.filter(item => item.jump_back).length
    if (node.next_list.length === 0) nodeStats.terminalCount += 1

    for (const reco of node.recognition) {
      if (reco.status === 'failed') nodeStats.failedRecoCount += 1
      if (reco.status === 'success') nodeStats.successRecoCount += 1
      recoIdToName.set(reco.reco_id, reco.name)

      const recoStats = recoByName.get(reco.name) ?? {
        name: reco.name,
        total: 0,
        failed: 0,
        success: 0,
        nodes: new Set<string>(),
      }

      recoStats.total += 1
      if (reco.status === 'failed') recoStats.failed += 1
      if (reco.status === 'success') recoStats.success += 1
      recoStats.nodes.add(node.name)
      recoByName.set(reco.name, recoStats)
    }

    byNodeName.set(node.name, nodeStats)
  }

  const longStayNodes = Array.from(byNodeName.values())
    .map(item => {
      const spanMs = item.firstTs != null && item.lastTs != null ? Math.max(0, item.lastTs - item.firstTs) : 0
      return {
        node: item.name,
        occurrences: item.occurrences,
        spanMs,
        failedRecoCount: item.failedRecoCount,
        successRecoCount: item.successRecoCount,
        failedNodeCount: item.failedNodeCount,
        avgJumpBackBranches: item.totalBranches > 0 ? item.jumpBackBranches / item.occurrences : 0,
        terminalCount: item.terminalCount,
      }
    })
    .sort((a, b) => {
      if (b.spanMs !== a.spanMs) return b.spanMs - a.spanMs
      return b.occurrences - a.occurrences
    })

  const recoFailuresByName = Array.from(recoByName.values())
    .map(item => ({
      name: item.name,
      failed: item.failed,
      success: item.success,
      total: item.total,
      failedRate: item.total > 0 ? item.failed / item.total : 0,
      inNodes: Array.from(item.nodes).sort(),
    }))
    .sort((a, b) => {
      if (b.failed !== a.failed) return b.failed - a.failed
      return b.total - a.total
    })

  const buyCardReco = recoFailuresByName.filter(item => item.name.toLowerCase().includes('buycard'))
  const buyCardNodes = longStayNodes.filter(item => item.node.toLowerCase().includes('buycard'))
  const flagNodeBuyCard = timeline.reduce((acc, node) => {
    if (node.name !== 'CCFlagInCombatMain') return acc
    let failed = 0
    let success = 0
    for (const reco of node.recognition) {
      if (!reco.name.toLowerCase().includes('buycard')) continue
      if (reco.status === 'failed') failed += 1
      if (reco.status === 'success') success += 1
    }
    return {
      failed: acc.failed + failed,
      success: acc.success + success,
    }
  }, { failed: 0, success: 0 })

  const repeatedRuns: Array<{
    node: string
    count: number
    spanMs: number
    fromNodeId: number
    toNodeId: number
    fromTs: string
    toTs: string
  }> = []

  if (timeline.length > 0) {
    let runStart = 0
    for (let i = 1; i <= timeline.length; i += 1) {
      const same = i < timeline.length && timeline[i].name === timeline[runStart].name
      if (same) continue

      const runEnd = i - 1
      const count = runEnd - runStart + 1
      if (count >= 2) {
        const startTs = toTimestampMs(timeline[runStart].timestamp)
        const endTs = toTimestampMs(timeline[runEnd].timestamp)
        const spanMs = startTs != null && endTs != null ? Math.max(0, endTs - startTs) : 0
        repeatedRuns.push({
          node: timeline[runStart].name,
          count,
          spanMs,
          fromNodeId: timeline[runStart].node_id,
          toNodeId: timeline[runEnd].node_id,
          fromTs: timeline[runStart].timestamp,
          toTs: timeline[runEnd].timestamp,
        })
      }
      runStart = i
    }
  }

  repeatedRuns.sort((a, b) => {
    if (b.spanMs !== a.spanMs) return b.spanMs - a.spanMs
    return b.count - a.count
  })

  return {
    longStayNodes: longStayNodes.slice(0, 12),
    recoFailuresByName: recoFailuresByName.slice(0, 20),
    repeatedRuns: repeatedRuns.slice(0, 12),
    buyCard: {
      reco: buyCardReco.slice(0, 10),
      nodes: buyCardNodes.slice(0, 10),
      inCCFlagInCombatMain: flagNodeBuyCard,
    },
    recoIdToName,
  }
}

const buildSignalDiagnostics = (lines: SignalLineItem[], recoIdToName: Map<number, string>) => {
  const failedRecoResultByName = new Map<string, number>()
  let unknownRecoNameCount = 0

  for (const item of lines) {
    if (!/failed to get_reco_result/i.test(item.text)) continue
    const recoId = extractRecoId(item.text)
    if (recoId == null) {
      unknownRecoNameCount += 1
      continue
    }

    const name = recoIdToName.get(recoId)
    if (!name) {
      unknownRecoNameCount += 1
      continue
    }

    failedRecoResultByName.set(name, (failedRecoResultByName.get(name) ?? 0) + 1)
  }

  const topFailedRecoResult = Array.from(failedRecoResultByName.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    failedRecoResultByName: topFailedRecoResult.slice(0, 20),
    unknownRecoNameCount,
    lineCount: lines.length,
  }
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

  const fullTaskTimeline: TimelineNodeItem[] = selectedTask
    ? selectedTask.nodes.map(node => ({
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

  const selectedNodeTimeline = fullTaskTimeline.slice(-80)

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

  const timelineDiagnostics = buildTimelineDiagnostics(fullTaskTimeline)
  const signalDiagnostics = signalLines
    ? buildSignalDiagnostics(signalLines.lines, timelineDiagnostics.recoIdToName)
    : null

  const knowledge = !input.includeKnowledgePack
    ? []
    : input.includeKnowledgeBootstrap
      ? buildKnowledgeBootstrap()
      : buildKnowledgeDigest(input.question, selectedTask)

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
    timelineDiagnostics: {
      scopeNodeCount: fullTaskTimeline.length,
      longStayNodes: timelineDiagnostics.longStayNodes,
      recoFailuresByName: timelineDiagnostics.recoFailuresByName,
      repeatedRuns: timelineDiagnostics.repeatedRuns,
      buyCard: timelineDiagnostics.buyCard,
    },
    signalLines,
    signalDiagnostics,
    knowledge,
  }
}
