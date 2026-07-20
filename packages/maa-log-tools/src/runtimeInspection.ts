import type { KernelOutput, NodeInfo, TaskInfo, UnifiedFlowItem } from '@windsland52/maa-log-kernel'
import type { FrameworkSession, FrameworkSessionExtraction } from './frameworkVersion'
import { buildNodeExecutionTimeline } from './nodeExecutionTimeline'

export const MLA_RUNTIME_INSPECTION_SCHEMA_VERSION = 'mla-runtime-inspection/v1'

export interface RuntimeEvidencePosition {
  timestamp: string | null
  parserInputLine: number | null
  source: string | null
  path: string | null
  localLine: number | null
}

export interface SourceSegment {
  source: string
  path: string
  startLine: number
  lineCount: number
}

interface RuntimeScope {
  sessionId: string | null
  executionId: string
  taskId: number
  taskName: string
}

export interface RuntimeFailure extends RuntimeScope {
  failureId: string
  kind: 'next_list_timeout' | 'action_failed'
  nodeId: number
  nodeName: string
  startedAt: string
  endedAt: string | null
  errorImages: string[]
  visionImages: string[]
  evidence: RuntimeEvidencePosition
}

export interface RuntimeOutcome extends RuntimeScope {
  outcomeId: string
  kind: 'pipeline_node' | 'task'
  status: 'failed' | 'running'
  nodeId: number | null
  nodeName: string | null
  directFailureIds: string[]
  evidence: RuntimeEvidencePosition
}

export interface RuntimeMetricDistribution {
  count: number
  minimum: number
  p50: number
  p95: number
  maximum: number
  average: number
}

export type RuntimeSignalPriority = 'high' | 'normal' | 'low'

export type RuntimeSignalPriorityReason =
  | 'timeout'
  | 'unmatched_terminal'
  | 'high_mixed_results'
  | 'high_unsuccessful_attempts'
  | 'high_occurrence_count'
  | 'related_to_direct_failure'
  | 'still_repeating_at_log_end'
  | 'high_repeat_count'
  | 'long_duration'
  | 'incomplete_repetition'

export interface RecognitionOccurrenceSample {
  nodeId: number
  startedAt: string
  endedAt: string | null
  attemptCount: number
  unsuccessfulAttempts: number
  terminalMatch: string | null
  evidence: { start: RuntimeEvidencePosition, end: RuntimeEvidencePosition }
}

export interface RecognitionActivitySignal extends RuntimeScope {
  signalId: string
  kind: 'recognition_activity'
  pipelineNodeName: string
  nextList: { name: string, anchor: boolean, jumpBack: boolean }[]
  occurrenceCount: number
  occurrencesWithMixedResults: number
  terminalOutcomes: { matched: number, timeout: number, running: number, unmatched: number }
  terminalMatches: { name: string, count: number }[]
  candidateStatistics: {
    name: string
    evaluationCount: number
    matchedAttemptCount: number
    unsuccessfulAttemptCount: number
    runningAttemptCount: number
    terminalMatchCount: number
  }[]
  unmappedAttemptCount: number
  attempts: RuntimeMetricDistribution
  unsuccessfulAttempts: RuntimeMetricDistribution
  durationMs: RuntimeMetricDistribution
  representatives: {
    first: RecognitionOccurrenceSample
    worst: RecognitionOccurrenceSample
    last: RecognitionOccurrenceSample
  }
  priority: RuntimeSignalPriority
  priorityReasons: RuntimeSignalPriorityReason[]
}

export interface RepeatedNodeSequenceSignal extends RuntimeScope {
  signalId: string
  kind: 'repeated_node' | 'repeated_node_cycle'
  pattern: string[]
  segmentCount: number
  totalRepeatCount: number
  maximumRepeatCount: number
  durationMs: RuntimeMetricDistribution
  terminations: { leftPattern: number, taskEnded: number, stillRepeatingAtLogEnd: number }
  representatives: {
    first: { firstSeenAt: string, lastSeenAt: string, repeatCount: number, evidence: RuntimeEvidencePosition }
    longest: { firstSeenAt: string, lastSeenAt: string, repeatCount: number, evidence: RuntimeEvidencePosition }
    last: { firstSeenAt: string, lastSeenAt: string, repeatCount: number, evidence: RuntimeEvidencePosition }
  }
  detector: {
    name: 'repeated-completed-node-sequence'
    version: 1
    minimumRepeats: number
    maximumPatternLength: 8
  }
  priority: RuntimeSignalPriority
  priorityReasons: RuntimeSignalPriorityReason[]
}

export type RuntimeSignal = RecognitionActivitySignal | RepeatedNodeSequenceSignal

export interface RuntimeTaskStatistics {
  nodeExecutions: number
  succeededNodes: number
  failedNodes: number
  runningNodes: number
  recognitionAttempts: number
  unsuccessfulRecognitionAttempts: number
  nodeExecutionsWithRecognition: number
  nodeExecutionsWithMixedRecognitionResults: number
  recognitionActivityGroups: number
  maximumRecognitionAttemptsPerNode: number
  maximumUnsuccessfulRecognitionAttemptsPerNode: number
  actionAttempts: number
  actionFailures: number
  nextListTimeouts: number
  errorImageReferences: number
  uniqueErrorImages: number
  visionImageReferences: number
  uniqueVisionImages: number
}

export interface RuntimeTaskExecution {
  executionId: string
  taskId: number
  name: string
  hash: string
  uuid: string
  status: TaskInfo['status']
  completeness: 'complete' | 'open_at_log_end'
  startedAt: string
  endedAt: string | null
  observedDurationMs: number | null
  firstNode: string | null
  lastNode: string | null
  statistics: RuntimeTaskStatistics
  directFailureIds: string[]
  outcomeIds: string[]
  signalIds: string[]
  signalHighlights: {
    recognitionActivity: string[]
    repetitions: string[]
  }
  evidence: { start: RuntimeEvidencePosition, end: RuntimeEvidencePosition }
}

export interface RuntimeSession {
  sessionId: string
  startKind: FrameworkSession['startKind']
  frameworkStatus: FrameworkSession['status']
  frameworkVersion: string | null
  versions: string[]
  start: FrameworkSession['start']
  end: FrameworkSession['end']
  tasks: RuntimeTaskExecution[]
  summary: {
    taskExecutions: number
    succeededTasks: number
    failedTasks: number
    runningTasks: number
    directFailures: number
    nextListTimeouts: number
    actionFailures: number
    signals: number
  }
}

export interface RuntimeInspection {
  schemaVersion: typeof MLA_RUNTIME_INSPECTION_SCHEMA_VERSION
  sessions: RuntimeSession[]
  unscopedTasks: RuntimeTaskExecution[]
  failures: RuntimeFailure[]
  outcomes: RuntimeOutcome[]
  signals: RuntimeSignal[]
  warnings: string[]
}

const timestampMs = (value: string | null | undefined): number | null => {
  if (!value) return null
  const parsed = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : null
}

const elapsed = (start: string, end?: string): number | null => {
  const startMs = timestampMs(start)
  const endMs = timestampMs(end)
  return startMs == null || endMs == null ? null : Math.max(0, endMs - startMs)
}

interface RuntimeEvidenceIndex {
  exactLines: Map<string, number>
  ordered: { timestamp: number, line: number }[]
}

const buildEvidenceIndex = (task: TaskInfo): RuntimeEvidenceIndex => {
  const exactLines = new Map<string, number>()
  const ordered: RuntimeEvidenceIndex['ordered'] = []
  for (const event of task.events) {
    if (event._lineNumber == null) continue
    if (!exactLines.has(event.timestamp)) exactLines.set(event.timestamp, event._lineNumber)
    const timestamp = timestampMs(event.timestamp)
    if (timestamp != null) ordered.push({ timestamp, line: event._lineNumber })
  }
  ordered.sort((left, right) => left.timestamp - right.timestamp)
  return { exactLines, ordered }
}

const evidence = (index: RuntimeEvidenceIndex, timestamp?: string): RuntimeEvidencePosition => {
  if (timestamp) {
    const exactLine = index.exactLines.get(timestamp)
    if (exactLine != null) return { timestamp, parserInputLine: exactLine , source: null, path: null, localLine: null}
  }
  const target = timestampMs(timestamp)
  if (target == null || index.ordered.length === 0) {
    return { timestamp: timestamp ?? null, parserInputLine: null , source: null, path: null, localLine: null}
  }
  let low = 0
  let high = index.ordered.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((index.ordered[middle]?.timestamp ?? target) < target) low = middle + 1
    else high = middle
  }
  const before = index.ordered[low - 1]
  const after = index.ordered[low]
  const nearest = before == null
    ? after
    : after == null || target - before.timestamp <= after.timestamp - target ? before : after
  return { timestamp: timestamp ?? null, parserInputLine: nearest?.line ?? null , source: null, path: null, localLine: null}
}

const recognitionItems = (items?: readonly UnifiedFlowItem[]): UnifiedFlowItem[] => (
  (items ?? []).flatMap(item => [
    ...(item.type === 'recognition' || item.type === 'recognition_node' ? [item] : []),
    ...recognitionItems(item.children),
  ])
)

const imagesFor = (node: NodeInfo): { error: string[], vision: string[] } => {
  const attempts = recognitionItems(node.node_flow)
  return {
    error: [node.error_image, ...attempts.map(item => item.error_image)]
      .filter((item): item is string => Boolean(item)),
    vision: attempts.map(item => item.vision_image).filter((item): item is string => Boolean(item)),
  }
}

const scopeFor = (
  task: TaskInfo,
  sessionId: string | null,
  executionId: string,
): RuntimeScope => ({
  sessionId,
  executionId,
  taskId: task.task_id,
  taskName: task.entry,
})

const sessionFor = (task: TaskInfo, sessions: readonly FrameworkSession[]): FrameworkSession | null => {
  const candidates = sessions.filter(session => session.start.timestamp != null
    && session.end.timestamp != null
    && task.start_time >= session.start.timestamp
    && task.start_time <= session.end.timestamp)
  const complete = candidates.filter(session => session.startKind === 'process_start')
  if (complete.length === 1) return complete[0] ?? null
  const partial = candidates.filter(session => session.startKind === 'partial_file')
  return complete.length === 0 && partial.length === 1 ? (partial[0] ?? null) : null
}

interface Repetition { start: number, length: number, count: number }

type RecognitionTerminalOutcome = 'matched' | 'timeout' | 'running' | 'unmatched'

interface RecognitionOccurrence {
  nodeId: number
  pipelineNodeName: string
  nextList: { name: string, anchor: boolean, jumpBack: boolean }[]
  attempts: UnifiedFlowItem[]
  terminalMatch: string | null
  terminalOutcome: RecognitionTerminalOutcome
  durationMs: number | null
  sample: RecognitionOccurrenceSample
}

const metricDistribution = (values: readonly number[]): RuntimeMetricDistribution => {
  if (values.length === 0) {
    return { count: 0, minimum: 0, p50: 0, p95: 0, maximum: 0, average: 0 }
  }
  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (ratio: number): number => (
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0
  )
  const total = sorted.reduce((sum, value) => sum + value, 0)
  return {
    count: sorted.length,
    minimum: sorted[0] ?? 0,
    p50: percentile(0.5),
    p95: percentile(0.95),
    maximum: sorted[sorted.length - 1] ?? 0,
    average: total / sorted.length,
  }
}

const recognitionCandidateName = (
  attempt: UnifiedFlowItem,
  nextNames: ReadonlySet<string>,
): string | null => {
  if (attempt.anchor_name && nextNames.has(attempt.anchor_name)) return attempt.anchor_name
  if (nextNames.has(attempt.name)) return attempt.name
  const detailName = attempt.reco_details?.name
  return detailName && nextNames.has(detailName) ? detailName : null
}

const increment = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1)
}

const prioritize = (
  reasons: RuntimeSignalPriorityReason[],
): { priority: RuntimeSignalPriority, priorityReasons: RuntimeSignalPriorityReason[] } => {
  if (reasons.length === 0) return { priority: 'low', priorityReasons: [] }
  if (
    reasons.includes('timeout')
    || reasons.includes('unmatched_terminal')
    || reasons.includes('still_repeating_at_log_end')
    || reasons.includes('related_to_direct_failure')
    || reasons.includes('incomplete_repetition')
  ) {
    return { priority: 'high', priorityReasons: reasons }
  }
  if (
    reasons.includes('high_mixed_results')
    || reasons.includes('high_unsuccessful_attempts')
    || reasons.includes('high_occurrence_count')
    || reasons.includes('high_repeat_count')
    || reasons.includes('long_duration')
  ) {
    return { priority: 'normal', priorityReasons: reasons }
  }
  return { priority: 'low', priorityReasons: reasons }
}

const repetitions = (nodes: readonly NodeInfo[]): Repetition[] => {
  const result: Repetition[] = []
  let start = 0
  while (start < nodes.length) {
    let best: Repetition | null = null
    for (let length = 1; length <= Math.min(8, Math.floor((nodes.length - start) / 2)); length += 1) {
      let count = 1
      while (start + (count + 1) * length <= nodes.length) {
        const same = nodes.slice(start, start + length).every(
          (node, offset) => node.name === nodes[start + count * length + offset]?.name,
        )
        if (!same) break
        count += 1
      }
      if (count < (length === 1 ? 5 : 3)) continue
      if (best == null || length * count > best.length * best.count) best = { start, length, count }
    }
    if (best == null) start += 1
    else {
      result.push(best)
      start += best.length * best.count
    }
  }
  return result
}

const canonicalCycle = (pattern: readonly string[]): string[] => {
  if (pattern.length < 2) return [...pattern]
  const rotations = pattern.map((_, index) => [...pattern.slice(index), ...pattern.slice(0, index)])
  rotations.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  return rotations[0] ?? [...pattern]
}

const findSourceSegment = (
  segments: readonly SourceSegment[],
  parserInputLine: number,
): SourceSegment | null => {
  for (const segment of segments) {
    if (parserInputLine >= segment.startLine && parserInputLine < segment.startLine + segment.lineCount) {
      return segment
    }
  }
  return null
}

const enrichWithSource = (
  position: RuntimeEvidencePosition,
  segments: readonly SourceSegment[] | undefined,
): RuntimeEvidencePosition => {
  if (!segments || position.parserInputLine == null) return position
  const segment = findSourceSegment(segments, position.parserInputLine)
  if (!segment) return position
  return {
    ...position,
    source: segment.source,
    path: segment.path,
    localLine: position.parserInputLine - segment.startLine + 1,
  }
}

const createEvidenceFn = (segments: readonly SourceSegment[] | undefined) =>
  (index: RuntimeEvidenceIndex, timestamp?: string): RuntimeEvidencePosition =>
    enrichWithSource(evidence(index, timestamp), segments)

export const buildRuntimeInspection = (
  output: KernelOutput,
  framework: FrameworkSessionExtraction,
  sourceSegments?: readonly SourceSegment[],
): RuntimeInspection => {
  const failures: RuntimeFailure[] = []
  const outcomes: RuntimeOutcome[] = []
  const signals: RuntimeSignal[] = []
  const taskOccurrences = new Map<number, number>()
  const executionIds = new Map<TaskInfo, string>()
  const sessionIds = new Map<TaskInfo, string | null>()
  const executionSessionIds = new Map<string, string | null>()
  const evidenceAt = createEvidenceFn(sourceSegments)
  for (const task of output.tasks) {
    const occurrence = (taskOccurrences.get(task.task_id) ?? 0) + 1
    taskOccurrences.set(task.task_id, occurrence)
    const executionId = `task-execution-${task.task_id}-${occurrence}`
    const sessionId = sessionFor(task, framework.sessions)?.sessionId ?? null
    executionIds.set(task, executionId)
    sessionIds.set(task, sessionId)
    executionSessionIds.set(executionId, sessionId)
  }

  const buildTask = (task: TaskInfo): RuntimeTaskExecution => {
    const sessionId = sessionIds.get(task) ?? null
    const executionId = executionIds.get(task)
    if (!executionId) throw new Error('Task execution identity was not initialized.')
    const scope = scopeFor(task, sessionId, executionId)
    const directFailureIds: string[] = []
    const outcomeIds: string[] = []
    const signalIds: string[] = []
    const recognitionOccurrences: RecognitionOccurrence[] = []
    const evidenceIndex = buildEvidenceIndex(task)
    const timeline = buildNodeExecutionTimeline(task.nodes, { rootTaskId: task.task_id })

    for (const item of timeline) {
      const failureKind = item.navStatus === 'action-failed'
        ? 'action_failed'
        : item.navStatus === 'timeout' && item.nodeInfo.next_list.length > 0
          ? 'next_list_timeout'
          : null
      let nodeFailureId: string | null = null
      if (failureKind) {
        nodeFailureId = `failure-${failures.length + 1}`
        const images = imagesFor(item.nodeInfo)
        failures.push({
          ...scope,
          failureId: nodeFailureId,
          kind: failureKind,
          nodeId: item.nodeInfo.node_id,
          nodeName: item.executionName,
          startedAt: item.nodeInfo.ts,
          endedAt: item.nodeInfo.end_ts ?? null,
          errorImages: [...new Set(images.error)],
          visionImages: [...new Set(images.vision)],
          evidence: evidenceAt(evidenceIndex, item.nodeInfo.end_ts ?? item.nodeInfo.ts),
        })
        directFailureIds.push(nodeFailureId)
      }
      if (item.nodeInfo.status !== 'success') {
        const outcomeId = `outcome-${outcomes.length + 1}`
        outcomes.push({
          ...scope,
          outcomeId,
          kind: 'pipeline_node',
          status: item.nodeInfo.status,
          nodeId: item.nodeInfo.node_id,
          nodeName: item.executionName,
          directFailureIds: nodeFailureId ? [nodeFailureId] : [],
          evidence: evidenceAt(evidenceIndex, item.nodeInfo.end_ts ?? item.nodeInfo.ts),
        })
        outcomeIds.push(outcomeId)
      }
      const attempts = recognitionItems(item.nodeInfo.node_flow)
      const missed = attempts.filter(attempt => attempt.status === 'failed')
      if (item.nodeInfo.next_list.length > 0) {
        const terminalOutcome: RecognitionTerminalOutcome = item.navStatus === 'timeout'
          ? 'timeout'
          : item.nodeInfo.status === 'running'
            ? 'running'
            : item.matchedRecognitionName ? 'matched' : 'unmatched'
        recognitionOccurrences.push({
          nodeId: item.nodeInfo.node_id,
          pipelineNodeName: item.nodeInfo.name,
          nextList: item.nodeInfo.next_list.map(next => ({
            name: next.name,
            anchor: next.anchor,
            jumpBack: next.jump_back,
          })),
          attempts,
          terminalMatch: item.matchedRecognitionName ?? null,
          terminalOutcome,
          durationMs: elapsed(item.nodeInfo.ts, item.nodeInfo.end_ts),
          sample: {
            nodeId: item.nodeInfo.node_id,
            startedAt: item.nodeInfo.ts,
            endedAt: item.nodeInfo.end_ts ?? null,
            attemptCount: attempts.length,
            unsuccessfulAttempts: missed.length,
            terminalMatch: item.matchedRecognitionName ?? null,
            evidence: {
              start: evidenceAt(evidenceIndex, attempts[0]?.ts ?? item.nodeInfo.ts),
              end: evidenceAt(evidenceIndex, item.nodeInfo.end_ts ?? item.nodeInfo.ts),
            },
          },
        })
      }
    }

    const recognitionGroups = new Map<string, RecognitionOccurrence[]>()
    for (const occurrence of recognitionOccurrences) {
      const key = JSON.stringify([occurrence.pipelineNodeName, occurrence.nextList])
      const group = recognitionGroups.get(key) ?? []
      group.push(occurrence)
      recognitionGroups.set(key, group)
    }
    for (const group of recognitionGroups.values()) {
      const firstOccurrence = group[0]
      const lastOccurrence = group[group.length - 1]
      if (!firstOccurrence || !lastOccurrence) continue
      const signalId = `signal-${signals.length + 1}`
      const terminalMatches = new Map<string, number>()
      const terminalOutcomes = { matched: 0, timeout: 0, running: 0, unmatched: 0 }
      const candidates = new Map(firstOccurrence.nextList.map(next => [next.name, {
        name: next.name,
        evaluationCount: 0,
        matchedAttemptCount: 0,
        unsuccessfulAttemptCount: 0,
        runningAttemptCount: 0,
        terminalMatchCount: 0,
      }]))
      let unmappedAttemptCount = 0
      let occurrencesWithMixedResults = 0
      for (const occurrence of group) {
        terminalOutcomes[occurrence.terminalOutcome] += 1
        if (occurrence.terminalMatch) {
          increment(terminalMatches, occurrence.terminalMatch)
          const candidate = candidates.get(occurrence.terminalMatch)
          if (candidate) candidate.terminalMatchCount += 1
        }
        const statuses = new Set(occurrence.attempts.map(attempt => attempt.status))
        if (statuses.has('failed') && statuses.has('success')) occurrencesWithMixedResults += 1
        const nextNames = new Set(candidates.keys())
        for (const attempt of occurrence.attempts) {
          const candidateName = recognitionCandidateName(attempt, nextNames)
          const candidate = candidateName ? candidates.get(candidateName) : null
          if (!candidate) {
            unmappedAttemptCount += 1
            continue
          }
          candidate.evaluationCount += 1
          if (attempt.status === 'success') candidate.matchedAttemptCount += 1
          else if (attempt.status === 'failed') candidate.unsuccessfulAttemptCount += 1
          else candidate.runningAttemptCount += 1
        }
      }
      const worstOccurrence = [...group].sort((left, right) => (
        right.sample.unsuccessfulAttempts - left.sample.unsuccessfulAttempts
        || right.sample.attemptCount - left.sample.attemptCount
      ))[0] ?? firstOccurrence
      const attemptsDist = metricDistribution(group.map(item => item.sample.attemptCount))
      const unsuccessfulDist = metricDistribution(group.map(item => item.sample.unsuccessfulAttempts))
      const durationDist = metricDistribution(group.flatMap(item => item.durationMs == null ? [] : [item.durationMs]))
      const reasons: RuntimeSignalPriorityReason[] = []
      if (terminalOutcomes.timeout > 0) reasons.push('timeout')
      if (terminalOutcomes.unmatched > 0) reasons.push('unmatched_terminal')
      if (group.length > 0 && occurrencesWithMixedResults / group.length >= 0.3) reasons.push('high_mixed_results')
      if (unsuccessfulDist.maximum >= 5 || unsuccessfulDist.p95 >= 3) reasons.push('high_unsuccessful_attempts')
      if (group.length >= 20) reasons.push('high_occurrence_count')
      if (group.some(item => item.sample.nodeId && failures.some(failure => failure.nodeId === item.sample.nodeId && failure.executionId === scope.executionId))) {
        reasons.push('related_to_direct_failure')
      }
      const ranking = prioritize(reasons)
      signals.push({
        ...scope,
        signalId,
        kind: 'recognition_activity',
        pipelineNodeName: firstOccurrence.pipelineNodeName,
        nextList: firstOccurrence.nextList,
        occurrenceCount: group.length,
        occurrencesWithMixedResults,
        terminalOutcomes,
        terminalMatches: [...terminalMatches].map(([name, count]) => ({ name, count }))
          .sort((left, right) => right.count - left.count),
        candidateStatistics: [...candidates.values()],
        unmappedAttemptCount,
        attempts: attemptsDist,
        unsuccessfulAttempts: unsuccessfulDist,
        durationMs: durationDist,
        representatives: {
          first: firstOccurrence.sample,
          worst: worstOccurrence.sample,
          last: lastOccurrence.sample,
        },
        priority: ranking.priority,
        priorityReasons: ranking.priorityReasons,
      })
      signalIds.push(signalId)
    }

    const completed = timeline.map(item => item.nodeInfo).filter(node => node.status !== 'running')
    const repetitionGroups = new Map<string, {
      pattern: string[]
      repeatCount: number
      durationMs: number
      termination: 'left_pattern' | 'task_ended' | 'still_repeating_at_log_end'
      firstSeenAt: string
      lastSeenAt: string
      evidence: RuntimeEvidencePosition
    }[]>()
    for (const repeated of repetitions(completed)) {
      const first = completed[repeated.start]
      const lastIndex = repeated.start + repeated.length * repeated.count - 1
      const last = completed[lastIndex]
      if (!first || !last) continue
      const reachesEnd = lastIndex === completed.length - 1
      const rawPattern = completed.slice(repeated.start, repeated.start + repeated.length).map(node => node.name)
      const pattern = repeated.length === 1 ? rawPattern : canonicalCycle(rawPattern)
      const kind = repeated.length === 1 ? 'repeated_node' : 'repeated_node_cycle'
      const key = JSON.stringify([kind, pattern])
      const group = repetitionGroups.get(key) ?? []
      group.push({
        pattern,
        repeatCount: repeated.count,
        durationMs: elapsed(first.ts, last.end_ts ?? last.ts) ?? 0,
        firstSeenAt: first.ts,
        lastSeenAt: last.end_ts ?? last.ts,
        termination: reachesEnd
          ? task.status === 'running' ? 'still_repeating_at_log_end' : 'task_ended'
          : 'left_pattern',
        evidence: evidenceAt(evidenceIndex, first.ts),
      })
      repetitionGroups.set(key, group)
    }
    for (const group of repetitionGroups.values()) {
      const first = group[0]
      const last = group[group.length - 1]
      if (!first || !last) continue
      const longest = [...group].sort((left, right) => right.durationMs - left.durationMs)[0] ?? first
      const signalId = `signal-${signals.length + 1}`
      const terminations = {
        leftPattern: group.filter(item => item.termination === 'left_pattern').length,
        taskEnded: group.filter(item => item.termination === 'task_ended').length,
        stillRepeatingAtLogEnd: group.filter(item => item.termination === 'still_repeating_at_log_end').length,
      }
      const totalRepeatCount = group.reduce((sum, item) => sum + item.repeatCount, 0)
      const maximumRepeatCount = Math.max(...group.map(item => item.repeatCount))
      const repetitionReasons: RuntimeSignalPriorityReason[] = []
      if (terminations.leftPattern > 0) repetitionReasons.push('incomplete_repetition')
      if (terminations.stillRepeatingAtLogEnd > 0) repetitionReasons.push('still_repeating_at_log_end')
      if (maximumRepeatCount >= 10 || totalRepeatCount >= 20) repetitionReasons.push('high_repeat_count')
      const repetitionRanking = prioritize(repetitionReasons)
      signals.push({
        ...scope,
        signalId,
        kind: first.pattern.length === 1 ? 'repeated_node' : 'repeated_node_cycle',
        pattern: first.pattern,
        segmentCount: group.length,
        totalRepeatCount,
        maximumRepeatCount,
        durationMs: metricDistribution(group.map(item => item.durationMs)),
        terminations,
        representatives: {
          first: first,
          longest,
          last,
        },
        detector: {
          name: 'repeated-completed-node-sequence',
          version: 1,
          minimumRepeats: first.pattern.length === 1 ? 5 : 3,
          maximumPatternLength: 8,
        },
        priority: repetitionRanking.priority,
        priorityReasons: repetitionRanking.priorityReasons,
      })
      signalIds.push(signalId)
    }
    if (task.status !== 'succeeded') {
      const outcomeId = `outcome-${outcomes.length + 1}`
      outcomes.push({
        ...scope,
        outcomeId,
        kind: 'task',
        status: task.status,
        nodeId: null,
        nodeName: null,
        directFailureIds: [...directFailureIds],
        evidence: evidenceAt(evidenceIndex, task.end_time ?? task.events[task.events.length - 1]?.timestamp),
      })
      outcomeIds.push(outcomeId)
    }

    const attemptsByNode = timeline.map(item => recognitionItems(item.nodeInfo.node_flow))
    const allAttempts = attemptsByNode.flat()
    const imageSets = timeline.map(item => imagesFor(item.nodeInfo))
    const errorImages = imageSets.flatMap(set => set.error)
    const visionImages = imageSets.flatMap(set => set.vision)
    const ownFailures = failures.filter(failure => directFailureIds.includes(failure.failureId))
    const ownSignals = signals.filter(signal => signalIds.includes(signal.signalId))
    const recognitionActivity = ownSignals
      .filter((signal): signal is RecognitionActivitySignal => (
        signal.kind === 'recognition_activity'
      ))
      .sort((left, right) => (
        right.unsuccessfulAttempts.maximum - left.unsuccessfulAttempts.maximum
        || right.occurrenceCount - left.occurrenceCount
      ))
      .slice(0, 5)
      .map(signal => signal.signalId)
    const repetitionSignals = ownSignals
      .filter((signal): signal is RepeatedNodeSequenceSignal => signal.kind !== 'recognition_activity')
      .sort((left, right) => (
        right.totalRepeatCount * right.pattern.length - left.totalRepeatCount * left.pattern.length
      ))
      .slice(0, 5)
      .map(signal => signal.signalId)
    return {
      executionId: scope.executionId,
      taskId: task.task_id,
      name: task.entry,
      hash: task.hash,
      uuid: task.uuid,
      status: task.status,
      completeness: task.status === 'running' ? 'open_at_log_end' : 'complete',
      startedAt: task.start_time,
      endedAt: task.end_time ?? null,
      observedDurationMs: task.duration ?? elapsed(task.start_time, task.end_time),
      firstNode: timeline[0]?.executionName ?? null,
      lastNode: timeline[timeline.length - 1]?.executionName ?? null,
      statistics: {
        nodeExecutions: timeline.length,
        succeededNodes: timeline.filter(item => item.nodeInfo.status === 'success').length,
        failedNodes: timeline.filter(item => item.nodeInfo.status === 'failed').length,
        runningNodes: timeline.filter(item => item.nodeInfo.status === 'running').length,
        recognitionAttempts: allAttempts.length,
        unsuccessfulRecognitionAttempts: allAttempts.filter(attempt => attempt.status === 'failed').length,
        nodeExecutionsWithRecognition: attemptsByNode.filter(attempts => attempts.length > 0).length,
        nodeExecutionsWithMixedRecognitionResults: attemptsByNode.filter(attempts => {
          const statuses = new Set(attempts.map(attempt => attempt.status))
          return statuses.has('failed') && statuses.has('success')
        }).length,
        recognitionActivityGroups: recognitionActivity.length,
        maximumRecognitionAttemptsPerNode: Math.max(0, ...attemptsByNode.map(attempts => attempts.length)),
        maximumUnsuccessfulRecognitionAttemptsPerNode: Math.max(
          0,
          ...attemptsByNode.map(attempts => attempts.filter(attempt => attempt.status === 'failed').length),
        ),
        actionAttempts: timeline.filter(item => item.nodeInfo.action_details != null).length,
        actionFailures: ownFailures.filter(failure => failure.kind === 'action_failed').length,
        nextListTimeouts: ownFailures.filter(failure => failure.kind === 'next_list_timeout').length,
        errorImageReferences: errorImages.length,
        uniqueErrorImages: new Set(errorImages).size,
        visionImageReferences: visionImages.length,
        uniqueVisionImages: new Set(visionImages).size,
      },
      directFailureIds,
      outcomeIds,
      signalIds,
      signalHighlights: { recognitionActivity, repetitions: repetitionSignals },
      evidence: {
        start: evidenceAt(evidenceIndex, task.start_time),
        end: evidenceAt(evidenceIndex, task.end_time ?? task.events[task.events.length - 1]?.timestamp),
      },
    }
  }

  const tasks = output.tasks.map(buildTask)
  const sessions = framework.sessions.map((session): RuntimeSession => {
    const scoped = tasks.filter(task => executionSessionIds.get(task.executionId) === session.sessionId)
    const ids = new Set(scoped.flatMap(task => task.directFailureIds))
    const scopedFailures = failures.filter(failure => ids.has(failure.failureId))
    return {
      sessionId: session.sessionId,
      startKind: session.startKind,
      frameworkStatus: session.status,
      frameworkVersion: session.version,
      versions: [...session.versions],
      start: session.start,
      end: session.end,
      tasks: scoped,
      summary: {
        taskExecutions: scoped.length,
        succeededTasks: scoped.filter(task => task.status === 'succeeded').length,
        failedTasks: scoped.filter(task => task.status === 'failed').length,
        runningTasks: scoped.filter(task => task.status === 'running').length,
        directFailures: scopedFailures.length,
        nextListTimeouts: scopedFailures.filter(failure => failure.kind === 'next_list_timeout').length,
        actionFailures: scopedFailures.filter(failure => failure.kind === 'action_failed').length,
        signals: scoped.reduce((count, task) => count + task.signalIds.length, 0),
      },
    }
  })
  const unscopedTasks = tasks.filter(task => executionSessionIds.get(task.executionId) == null)
  return {
    schemaVersion: MLA_RUNTIME_INSPECTION_SCHEMA_VERSION,
    sessions,
    unscopedTasks,
    failures,
    outcomes,
    signals,
    warnings: [
      ...framework.warnings,
      ...(unscopedTasks.length
        ? [`${unscopedTasks.length} task execution(s) could not be assigned to one runtime session.`]
        : []),
    ],
  }
}
