import type {
  NestedActionGroup,
  NestedActionNode,
  NodeInfo,
  RecognitionAttempt,
  UnifiedFlowItem,
} from '../shared/types'

const cloneUnifiedFlowItem = (
  item: UnifiedFlowItem,
  cloneRecognitionAttempt: (attempt: RecognitionAttempt) => RecognitionAttempt,
): UnifiedFlowItem => {
  return {
    ...item,
    children: item.children?.map((child) => cloneUnifiedFlowItem(child, cloneRecognitionAttempt)),
  }
}

export const cloneNestedActionGroup = (
  group: NestedActionGroup,
  cloneRecognitionAttempt: (attempt: RecognitionAttempt) => RecognitionAttempt,
): NestedActionGroup => {
  return {
    ...group,
    nested_actions: (group.nested_actions ?? []).map((action) => ({
      ...action,
      next_list: action.next_list ? action.next_list.map((next) => ({ ...next })) : undefined,
      node_flow: action.node_flow
        ? action.node_flow.map((item) => cloneUnifiedFlowItem(item, cloneRecognitionAttempt))
        : undefined,
      recognitions: (action.recognitions ?? []).map(cloneRecognitionAttempt),
      child_tasks: action.child_tasks?.map((child) =>
        cloneNestedActionGroup(child, cloneRecognitionAttempt),
      ),
    })),
  }
}

const traverseNestedActionNodes = (
  groups: NestedActionGroup[],
  visitor: (action: NestedActionNode) => boolean,
): boolean => {
  for (const group of groups) {
    for (const action of group.nested_actions ?? []) {
      if (visitor(action)) return true
      if (action.child_tasks && action.child_tasks.length > 0) {
        if (traverseNestedActionNodes(action.child_tasks, visitor)) return true
      }
    }
  }
  return false
}

interface RecognitionOrderMeta {
  startSeq: number
  endSeq: number
}

interface AttachAcrossScopesParams {
  topLevelAttempts: RecognitionAttempt[]
  nestedActionGroups: NestedActionGroup[]
  actionLevelNodes: RecognitionAttempt[]
  actionStartOrder?: number
  recognitionOrderMeta: WeakMap<RecognitionAttempt, RecognitionOrderMeta>
  cloneRecognitionAttempt: (attempt: RecognitionAttempt) => RecognitionAttempt
  sortByParseOrderThenRecoId: (items: RecognitionAttempt[]) => RecognitionAttempt[]
  pickBestAttemptIndex: (attempts: RecognitionAttempt[], node: RecognitionAttempt) => number
  attachNodeToAttempt: (attempt: RecognitionAttempt, node: RecognitionAttempt) => void
  dedupeRecognitionAttempts: (items: RecognitionAttempt[]) => RecognitionAttempt[]
}

export const attachActionLevelRecognitionAcrossScopes = (params: AttachAcrossScopesParams) => {
  const mergedTopLevelAttempts = params.topLevelAttempts.map(params.cloneRecognitionAttempt)
  const mergedNestedGroups = params.nestedActionGroups.map((group) =>
    cloneNestedActionGroup(group, params.cloneRecognitionAttempt),
  )
  const remaining: RecognitionAttempt[] = []
  const orderedNodes = params.sortByParseOrderThenRecoId(params.actionLevelNodes)

  for (const node of orderedNodes) {
    let attached = traverseNestedActionNodes(mergedNestedGroups, (action) => {
      const attempts: RecognitionAttempt[] = action.recognitions ?? []
      if (!attempts.length) return false
      const idx = params.pickBestAttemptIndex(attempts, node)
      if (idx < 0) return false
      params.attachNodeToAttempt(attempts[idx], node)
      return true
    })
    if (attached) continue

    const nodeMeta = params.recognitionOrderMeta.get(node)
    const canAttachToTopLevel =
      mergedTopLevelAttempts.length > 0 &&
      (params.actionStartOrder == null ||
        (nodeMeta != null && nodeMeta.startSeq < params.actionStartOrder))
    if (canAttachToTopLevel) {
      const idx = params.pickBestAttemptIndex(mergedTopLevelAttempts, node)
      if (idx >= 0) {
        params.attachNodeToAttempt(mergedTopLevelAttempts[idx], node)
        attached = true
      }
    }

    if (!attached) {
      remaining.push(node)
    }
  }

  return {
    topLevelAttempts: mergedTopLevelAttempts,
    nestedActionGroups: mergedNestedGroups,
    remaining: params.dedupeRecognitionAttempts(remaining),
  }
}

export const splitRecognitionAttemptsByActionWindow = (
  attempts: RecognitionAttempt[],
  recognitionOrderMeta: WeakMap<RecognitionAttempt, RecognitionOrderMeta>,
  actionStartOrder?: number,
  actionEndOrder?: number,
) => {
  const topLevel: RecognitionAttempt[] = []
  const actionLevel: RecognitionAttempt[] = []
  for (const attempt of attempts) {
    const attemptMeta = recognitionOrderMeta.get(attempt)
    const inActionWindow =
      actionStartOrder != null &&
      attemptMeta != null &&
      attemptMeta.endSeq >= actionStartOrder &&
      (actionEndOrder == null || attemptMeta.startSeq <= actionEndOrder)
    if (inActionWindow) {
      actionLevel.push(attempt)
    } else {
      topLevel.push(attempt)
    }
  }
  return { topLevel, actionLevel }
}

export const resolveFallbackRecoDetails = (
  details: Record<string, any>,
  recognitions: RecognitionAttempt[],
): NodeInfo['reco_details'] => {
  if (details.reco_details) return details.reco_details
  return recognitions.length > 0 ? recognitions[recognitions.length - 1].reco_details : undefined
}
