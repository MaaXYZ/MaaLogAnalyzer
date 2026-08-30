import type { RecognitionAttempt } from '../shared/types'

export type RecognitionOrderMeta = {
  startSeq: number
  endSeq: number
}

export const createRecognitionAttemptHelpers = (
  recognitionOrderMeta: WeakMap<RecognitionAttempt, RecognitionOrderMeta>,
) => {
  const mergeRecognitionOrderMeta = (target: RecognitionAttempt, source: RecognitionAttempt) => {
    const targetMeta = recognitionOrderMeta.get(target)
    const sourceMeta = recognitionOrderMeta.get(source)
    if (!targetMeta && !sourceMeta) return
    recognitionOrderMeta.set(target, {
      startSeq:
        targetMeta && sourceMeta
          ? Math.min(targetMeta.startSeq, sourceMeta.startSeq)
          : (targetMeta?.startSeq ?? sourceMeta!.startSeq),
      endSeq:
        targetMeta && sourceMeta
          ? Math.max(targetMeta.endSeq, sourceMeta.endSeq)
          : (targetMeta?.endSeq ?? sourceMeta!.endSeq),
    })
  }

  const mergeRecognitionAttempts = (
    left: RecognitionAttempt,
    right: RecognitionAttempt,
  ): RecognitionAttempt => {
    const leftEnded = left.status !== 'running'
    const rightEnded = right.status !== 'running'
    const leftEndTs = left.end_ts ?? ''
    const rightEndTs = right.end_ts ?? ''

    let preferred = left
    let secondary = right

    if (rightEnded && !leftEnded) {
      preferred = right
      secondary = left
    } else if (rightEnded === leftEnded && rightEndTs > leftEndTs) {
      preferred = right
      secondary = left
    }

    if (!preferred.name && secondary.name) {
      preferred.name = secondary.name
    }
    if (!preferred.ts && secondary.ts) {
      preferred.ts = secondary.ts
    }
    if (secondary.end_ts && (!preferred.end_ts || secondary.end_ts > preferred.end_ts)) {
      preferred.end_ts = secondary.end_ts
    }
    if (preferred.status === 'running' && secondary.status !== 'running') {
      preferred.status = secondary.status
    }
    if (!preferred.reco_details && secondary.reco_details) {
      preferred.reco_details = secondary.reco_details
    }
    if (!preferred.anchor_name && secondary.anchor_name) {
      preferred.anchor_name = secondary.anchor_name
    }
    if (!preferred.error_image && secondary.error_image) {
      preferred.error_image = secondary.error_image
    }
    if (!preferred.vision_image && secondary.vision_image) {
      preferred.vision_image = secondary.vision_image
    }

    const mergedNestedNodes = [...(preferred.nested_nodes ?? []), ...(secondary.nested_nodes ?? [])]
    preferred.nested_nodes =
      mergedNestedNodes.length > 0 ? dedupeRecognitionAttempts(mergedNestedNodes) : undefined

    mergeRecognitionOrderMeta(preferred, secondary)
    return preferred
  }

  const dedupeRecognitionAttempts = (items: RecognitionAttempt[]) => {
    const mergedByRecoId = new Map<number, RecognitionAttempt>()
    const order: number[] = []
    for (const item of items) {
      const existing = mergedByRecoId.get(item.reco_id)
      if (!existing) {
        mergedByRecoId.set(item.reco_id, item)
        order.push(item.reco_id)
        continue
      }
      mergedByRecoId.set(item.reco_id, mergeRecognitionAttempts(existing, item))
    }
    return order
      .map((recoId) => mergedByRecoId.get(recoId))
      .filter((item): item is RecognitionAttempt => !!item)
  }

  const sortByParseOrderThenRecoId = (items: RecognitionAttempt[]) => {
    return [...items].sort((a, b) => {
      const am = recognitionOrderMeta.get(a)
      const bm = recognitionOrderMeta.get(b)
      const aEnd = am?.endSeq ?? Number.POSITIVE_INFINITY
      const bEnd = bm?.endSeq ?? Number.POSITIVE_INFINITY
      if (aEnd !== bEnd) return aEnd - bEnd
      const aStart = am?.startSeq ?? Number.POSITIVE_INFINITY
      const bStart = bm?.startSeq ?? Number.POSITIVE_INFINITY
      if (aStart !== bStart) return aStart - bStart
      return a.reco_id - b.reco_id
    })
  }

  const pickBestAttemptIndex = (
    attempts: RecognitionAttempt[],
    node: RecognitionAttempt,
  ): number => {
    const nodeMeta = recognitionOrderMeta.get(node)
    if (!nodeMeta) {
      return attempts.length === 1 ? 0 : -1
    }
    const nodeStartSeq = nodeMeta.startSeq

    type Candidate = {
      idx: number
      bucket: number
      startSeq: number
      endSeq: number
      distance: number
    }

    let best: Candidate | null = null

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i]
      const meta = recognitionOrderMeta.get(attempt)
      if (!meta) continue
      const startSeq = meta.startSeq
      const endSeq = Math.max(meta.startSeq, meta.endSeq)

      let bucket: number
      let distance: number

      if (nodeStartSeq >= startSeq && nodeStartSeq <= endSeq) {
        bucket = 0
        distance = 0
      } else if (nodeStartSeq >= endSeq) {
        bucket = 1
        distance = nodeStartSeq - endSeq
      } else {
        continue
      }

      const current: Candidate = { idx: i, bucket, startSeq, endSeq, distance }
      if (!best) {
        best = current
        continue
      }

      if (current.bucket < best.bucket) {
        best = current
        continue
      }
      if (current.bucket > best.bucket) continue

      if (current.startSeq > best.startSeq) {
        best = current
        continue
      }
      if (current.startSeq < best.startSeq) continue

      if (current.distance < best.distance) {
        best = current
        continue
      }
      if (current.distance > best.distance) continue

      if (current.endSeq > best.endSeq) {
        best = current
      }
    }

    return best?.idx ?? -1
  }

  const cloneRecognitionAttempt = (attempt: RecognitionAttempt): RecognitionAttempt => {
    const cloned: RecognitionAttempt = {
      ...attempt,
      nested_nodes: attempt.nested_nodes
        ? dedupeRecognitionAttempts([...attempt.nested_nodes])
        : undefined,
    }
    const meta = recognitionOrderMeta.get(attempt)
    if (meta) {
      recognitionOrderMeta.set(cloned, { ...meta })
    }
    return cloned
  }

  const attachNodeToAttempt = (attempt: RecognitionAttempt, node: RecognitionAttempt) => {
    const mergedNested = dedupeRecognitionAttempts([...(attempt.nested_nodes ?? []), node])
    attempt.nested_nodes = mergedNested
  }

  const attachRecognitionNodesToAttempts = (
    attempts: RecognitionAttempt[],
    recognitionNodes: RecognitionAttempt[],
  ) => {
    if (attempts.length === 0) {
      return {
        attempts: [] as RecognitionAttempt[],
        orphans: recognitionNodes,
      }
    }

    const mergedAttempts = attempts.map((attempt) => {
      const cloned: RecognitionAttempt = {
        ...attempt,
        nested_nodes: attempt.nested_nodes ? [...attempt.nested_nodes] : undefined,
      }
      const meta = recognitionOrderMeta.get(attempt)
      if (meta) {
        recognitionOrderMeta.set(cloned, { ...meta })
      }
      return cloned
    })
    const sortedNodes = sortByParseOrderThenRecoId(recognitionNodes)
    const orphans: RecognitionAttempt[] = []

    for (const node of sortedNodes) {
      const targetIdx = pickBestAttemptIndex(mergedAttempts, node)
      if (targetIdx < 0) {
        orphans.push(node)
        continue
      }

      const target = mergedAttempts[targetIdx]
      const mergedNested = dedupeRecognitionAttempts([...(target.nested_nodes ?? []), node])
      target.nested_nodes = mergedNested
    }

    return {
      attempts: mergedAttempts,
      orphans,
    }
  }

  return {
    dedupeRecognitionAttempts,
    sortByParseOrderThenRecoId,
    pickBestAttemptIndex,
    attachRecognitionNodesToAttempts,
    cloneRecognitionAttempt,
    attachNodeToAttempt,
  }
}
