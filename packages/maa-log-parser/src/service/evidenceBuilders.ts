import type { Evidence } from './types'

const fnv1aHash = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36)
}

export const buildEvidence = (input: {
  source_tool: string
  source_range: Evidence['source_range']
  payload: Record<string, unknown>
  confidence?: number
}): Evidence => {
  const serialized = JSON.stringify({
    source_tool: input.source_tool,
    source_range: input.source_range,
    payload: input.payload,
  })
  return {
    evidence_id: `evi_${fnv1aHash(serialized)}`,
    source_tool: input.source_tool,
    source_range: input.source_range,
    payload: input.payload,
    confidence: input.confidence ?? 1,
  }
}

export const buildLineEvidence = (input: {
  session_id: string
  source_tool: string
  source_key: string
  line: number
  text: string
  task_id?: number
  node_id?: number
  scope_id?: string
  occurrence_index?: number
  payload?: Record<string, unknown>
}): Evidence => {
  return buildEvidence({
    source_tool: input.source_tool,
    source_range: {
      session_id: input.session_id,
      source_key: input.source_key,
      task_id: input.task_id,
      node_id: input.node_id,
      scope_id: input.scope_id,
      occurrence_index: input.occurrence_index,
      line_start: input.line,
      line_end: input.line,
    },
    payload: {
      line_text: input.text,
      ...input.payload,
    },
  })
}
