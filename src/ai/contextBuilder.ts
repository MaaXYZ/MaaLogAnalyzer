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

  const failedRecoByNodeAndName = new Map<string, {
    node: string
    reco: string
    failed: number
    total: number
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

      const pairKey = `${node.name}@@${reco.name}`
      const pairStats = failedRecoByNodeAndName.get(pairKey) ?? {
        node: node.name,
        reco: reco.name,
        failed: 0,
        total: 0,
      }
      pairStats.total += 1
      if (reco.status === 'failed') pairStats.failed += 1
      failedRecoByNodeAndName.set(pairKey, pairStats)
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

  const hotspotRecoPairs = Array.from(failedRecoByNodeAndName.values())
    .map(item => ({
      node: item.node,
      reco: item.reco,
      failed: item.failed,
      total: item.total,
      failedRate: item.total > 0 ? item.failed / item.total : 0,
    }))
    .sort((a, b) => {
      if (b.failed !== a.failed) return b.failed - a.failed
      return b.total - a.total
    })

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
    recoFailuresByNameAll: recoFailuresByName,
    repeatedRuns: repeatedRuns.slice(0, 12),
    hotspotRecoPairs: hotspotRecoPairs.slice(0, 20),
    recoIdToName,
  }
}

export const buildSignalDiagnostics = (
  lines: SignalLineItem[],
  recoIdToName: Map<number, string>,
  recoFailuresByName: Array<{ name: string; failed: number }>
) => {
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

  const timelineFailedMap = new Map<string, number>()
  for (const item of recoFailuresByName) {
    timelineFailedMap.set(item.name, item.failed)
  }

  const breakdownNames = new Set<string>([
    ...Array.from(timelineFailedMap.keys()),
    ...Array.from(failedRecoResultByName.keys()),
  ])

  const failureTypeBreakdown = Array.from(breakdownNames).map(name => {
    const totalFailed = timelineFailedMap.get(name) ?? 0
    const recoResultFailed = failedRecoResultByName.get(name) ?? 0
    const recognitionMissOrRuleFailed = Math.max(0, totalFailed - recoResultFailed)
    const dominantType = recoResultFailed > recognitionMissOrRuleFailed
      ? 'reco_result_fetch_failed'
      : recognitionMissOrRuleFailed > 0
        ? 'recognition_miss_or_rule_failed'
        : 'unknown'

    return {
      name,
      totalFailed,
      recoResultFailed,
      recognitionMissOrRuleFailed,
      dominantType,
    }
  }).sort((a, b) => {
    if (b.totalFailed !== a.totalFailed) return b.totalFailed - a.totalFailed
    return b.recoResultFailed - a.recoResultFailed
  })

  const totalRecoResultFailed = topFailedRecoResult.reduce((acc, item) => acc + item.count, 0)
  const totalTimelineFailed = recoFailuresByName.reduce((acc, item) => acc + item.failed, 0)
  const recoResultFailureRatio = totalTimelineFailed > 0 ? totalRecoResultFailed / totalTimelineFailed : 0

  return {
    failedRecoResultByName: topFailedRecoResult.slice(0, 20),
    failureTypeBreakdown: failureTypeBreakdown.slice(0, 24),
    totalRecoResultFailed,
    totalTimelineFailed,
    recoResultFailureRatio,
    unknownRecoNameCount,
    lineCount: lines.length,
  }
}

export const buildDeterministicFindings = (
  timelineDiagnostics: {
    longStayNodes: Array<{
      node: string
      occurrences: number
      spanMs: number
      failedRecoCount: number
      successRecoCount: number
    }>
    repeatedRuns: Array<{
      node: string
      count: number
      spanMs: number
    }>
    hotspotRecoPairs: Array<{
      node: string
      reco: string
      failed: number
      total: number
      failedRate: number
    }>
  },
  signalDiagnostics: null | {
    failureTypeBreakdown: Array<{
      name: string
      totalFailed: number
      recoResultFailed: number
      recognitionMissOrRuleFailed: number
      dominantType: string
    }>
    recoResultFailureRatio: number
    totalRecoResultFailed: number
    totalTimelineFailed: number
  }
) => {
  const findings: Array<{
    id: string
    confidence: number
    causeType: 'loop_or_rule' | 'reco_result_fetch' | 'mixed'
    summary: string
    evidencePaths: string[]
  }> = []

  const unknowns: string[] = []

  const topStay = timelineDiagnostics.longStayNodes[0]
  if (topStay) {
    findings.push({
      id: 'long_stay_hotspot',
      confidence: topStay.spanMs >= 30000 || topStay.occurrences >= 8 ? 80 : 68,
      causeType: 'loop_or_rule',
      summary: `长停留热点节点 ${topStay.node}（occurrences=${topStay.occurrences}, spanMs=${topStay.spanMs}, failedReco=${topStay.failedRecoCount}）。`,
      evidencePaths: ['timelineDiagnostics.longStayNodes[0]'],
    })
  } else {
    unknowns.push('longStayNodes 为空，无法识别长停留热点。')
  }

  const topPair = timelineDiagnostics.hotspotRecoPairs[0]
  if (topPair && topPair.failed > 0) {
    findings.push({
      id: 'reco_pair_hotspot',
      confidence: topPair.failed >= 8 || topPair.failedRate >= 0.8 ? 82 : 70,
      causeType: 'loop_or_rule',
      summary: `高失败识别对 ${topPair.node}/${topPair.reco}（failed=${topPair.failed}, total=${topPair.total}, failedRate=${topPair.failedRate.toFixed(3)}）。`,
      evidencePaths: ['timelineDiagnostics.hotspotRecoPairs[0]'],
    })
  }

  const topRun = timelineDiagnostics.repeatedRuns[0]
  if (topRun) {
    findings.push({
      id: 'repeated_run_hotspot',
      confidence: topRun.count >= 5 ? 78 : 64,
      causeType: 'loop_or_rule',
      summary: `最长连续重复节点 ${topRun.node}（count=${topRun.count}, spanMs=${topRun.spanMs}）。`,
      evidencePaths: ['timelineDiagnostics.repeatedRuns[0]'],
    })
  }

  if (signalDiagnostics) {
    const ratio = signalDiagnostics.recoResultFailureRatio
    findings.push({
      id: 'reco_result_fetch_ratio',
      confidence: ratio >= 0.25 ? 84 : 58,
      causeType: ratio >= 0.25 ? 'reco_result_fetch' : 'mixed',
      summary: `failed_to_get_reco_result 占比 ${(ratio * 100).toFixed(1)}%（${signalDiagnostics.totalRecoResultFailed}/${signalDiagnostics.totalTimelineFailed || 0}）。`,
      evidencePaths: [
        'signalDiagnostics.recoResultFailureRatio',
        'signalDiagnostics.totalRecoResultFailed',
        'signalDiagnostics.totalTimelineFailed',
      ],
    })

    const topType = signalDiagnostics.failureTypeBreakdown[0]
    if (topType) {
      findings.push({
        id: 'top_failure_type',
        confidence: 74,
        causeType: topType.dominantType === 'reco_result_fetch_failed' ? 'reco_result_fetch' : 'loop_or_rule',
        summary: `失败热点识别项 ${topType.name}（total=${topType.totalFailed}, reco_result_failed=${topType.recoResultFailed}, recognition_miss_or_rule_failed=${topType.recognitionMissOrRuleFailed}）。`,
        evidencePaths: ['signalDiagnostics.failureTypeBreakdown[0]'],
      })
    }
  } else {
    unknowns.push('未注入 signalLines，无法判定失败分型占比。')
  }

  return {
    findings,
    unknowns,
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

  const selectedEventTailFull = selectedTask
    ? selectedTask.events.slice(-140).map(summarizeEvent)
    : []

  const failureCandidatesFull = collectFailureNodes(selectedTask, 96)

  const bestTarget = input.includeSignalLines ? pickBestTarget(input.loadedTargets ?? [], input.loadedDefaultTargetId) : null
  const signalLineItemsFull = bestTarget ? collectSignalLines(bestTarget, 96, 220) : []

  const timelineDiagnostics = buildTimelineDiagnostics(fullTaskTimeline)
  const signalDiagnostics = bestTarget
    ? buildSignalDiagnostics(signalLineItemsFull, timelineDiagnostics.recoIdToName, timelineDiagnostics.recoFailuresByNameAll)
    : null
  const deterministicFindings = buildDeterministicFindings(
    {
      longStayNodes: timelineDiagnostics.longStayNodes,
      repeatedRuns: timelineDiagnostics.repeatedRuns,
      hotspotRecoPairs: timelineDiagnostics.hotspotRecoPairs,
    },
    signalDiagnostics
  )

  const knowledgeFull = !input.includeKnowledgePack
    ? []
    : input.includeKnowledgeBootstrap
      ? buildKnowledgeBootstrap()
      : buildKnowledgeDigest(input.question, selectedTask)

  const contextTargetChars = 52000
  const slicePlan = {
    nodeLimit: Math.min(fullTaskTimeline.length, 96),
    eventLimit: Math.min(selectedEventTailFull.length, 52),
    failureLimit: Math.min(failureCandidatesFull.length, 32),
    signalLimit: Math.min(signalLineItemsFull.length, 70),
    knowledgeLimit: Math.min(knowledgeFull.length, 18),
  }
  const sliceMin = {
    nodeLimit: Math.min(fullTaskTimeline.length, 18),
    eventLimit: Math.min(selectedEventTailFull.length, 10),
    failureLimit: Math.min(failureCandidatesFull.length, 8),
    signalLimit: Math.min(signalLineItemsFull.length, 18),
    knowledgeLimit: Math.min(knowledgeFull.length, 4),
  }

  const applySlicePlan = () => ({
    selectedNodeTimeline: fullTaskTimeline.slice(-slicePlan.nodeLimit),
    selectedEventTail: selectedEventTailFull.slice(-slicePlan.eventLimit),
    failureCandidates: failureCandidatesFull.slice(0, slicePlan.failureLimit),
    signalLines: bestTarget
      ? {
          target: bestTarget.fileName || bestTarget.label,
          lines: signalLineItemsFull.slice(0, slicePlan.signalLimit),
        }
      : null,
    knowledge: knowledgeFull.slice(0, slicePlan.knowledgeLimit),
  })

  const estimateContextChars = () => {
    const sliced = applySlicePlan()
    return JSON.stringify({
      generatedAt: 'x',
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
      selectedNodeTimeline: sliced.selectedNodeTimeline,
      selectedEventTail: sliced.selectedEventTail,
      failureCandidates: sliced.failureCandidates,
      timelineDiagnostics: {
        scopeNodeCount: fullTaskTimeline.length,
        longStayNodes: timelineDiagnostics.longStayNodes,
        recoFailuresByName: timelineDiagnostics.recoFailuresByName,
        repeatedRuns: timelineDiagnostics.repeatedRuns,
        hotspotRecoPairs: timelineDiagnostics.hotspotRecoPairs,
      },
      signalLines: sliced.signalLines,
      signalDiagnostics,
      deterministicFindings,
      knowledge: sliced.knowledge,
    }).length
  }

  const reduceOneStep = (): boolean => {
    const candidates = [
      { key: 'nodeLimit', score: slicePlan.nodeLimit * 170, step: 12 },
      { key: 'signalLimit', score: slicePlan.signalLimit * 140, step: 8 },
      { key: 'failureLimit', score: slicePlan.failureLimit * 140, step: 5 },
      { key: 'eventLimit', score: slicePlan.eventLimit * 95, step: 6 },
      { key: 'knowledgeLimit', score: slicePlan.knowledgeLimit * 180, step: 2 },
    ]
      .filter(item => slicePlan[item.key as keyof typeof slicePlan] > sliceMin[item.key as keyof typeof sliceMin])
      .sort((a, b) => b.score - a.score)

    if (candidates.length === 0) return false

    const target = candidates[0]
    const key = target.key as keyof typeof slicePlan
    const next = Math.max(
      sliceMin[key],
      slicePlan[key] - target.step
    )
    if (next >= slicePlan[key]) return false
    slicePlan[key] = next
    return true
  }

  let estimatedChars = estimateContextChars()
  let guard = 0
  while (estimatedChars > contextTargetChars && guard < 28) {
    const changed = reduceOneStep()
    if (!changed) break
    estimatedChars = estimateContextChars()
    guard += 1
  }

  const sliced = applySlicePlan()

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
    selectedNodeTimeline: sliced.selectedNodeTimeline,
    selectedEventTail: sliced.selectedEventTail,
    failureCandidates: sliced.failureCandidates,
    timelineDiagnostics: {
      scopeNodeCount: fullTaskTimeline.length,
      longStayNodes: timelineDiagnostics.longStayNodes,
      recoFailuresByName: timelineDiagnostics.recoFailuresByName,
      repeatedRuns: timelineDiagnostics.repeatedRuns,
      hotspotRecoPairs: timelineDiagnostics.hotspotRecoPairs,
    },
    signalLines: sliced.signalLines,
    signalDiagnostics,
    deterministicFindings,
    knowledge: sliced.knowledge,
    contextBudget: {
      targetChars: contextTargetChars,
      estimatedChars,
      nodeLimit: slicePlan.nodeLimit,
      eventLimit: slicePlan.eventLimit,
      failureLimit: slicePlan.failureLimit,
      signalLimit: slicePlan.signalLimit,
      knowledgeLimit: slicePlan.knowledgeLimit,
    },
  }
}
