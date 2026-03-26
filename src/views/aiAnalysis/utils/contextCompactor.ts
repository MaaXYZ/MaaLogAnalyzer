const toObjectArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []

export const buildCompactContext = (context: Record<string, unknown>): Record<string, unknown> => {
  const timelineDiagnostics = (context.timelineDiagnostics as Record<string, unknown> | undefined) ?? {}
  const deterministicFindings = (context.deterministicFindings as Record<string, unknown> | undefined) ?? {}
  const eventChainDiagnosticsRaw = (context.eventChainDiagnostics as Record<string, unknown> | undefined) ?? {}
  const stopTerminationDiagnosticsRaw = (context.stopTerminationDiagnostics as Record<string, unknown> | undefined) ?? {}
  const nextCandidateAvailabilityDiagnosticsRaw = (context.nextCandidateAvailabilityDiagnostics as Record<string, unknown> | undefined) ?? {}
  const anchorResolutionDiagnosticsRaw = (context.anchorResolutionDiagnostics as Record<string, unknown> | undefined) ?? {}
  const jumpBackFlowDiagnosticsRaw = (context.jumpBackFlowDiagnostics as Record<string, unknown> | undefined) ?? {}
  const nestedActionDiagnosticsRaw = (context.nestedActionDiagnostics as Record<string, unknown> | undefined) ?? {}
  const selectedNodeFocusRaw = (context.selectedNodeFocus as Record<string, unknown> | null | undefined) ?? null

  const selectedNodeTimeline = toObjectArray(context.selectedNodeTimeline)
    .slice(-40)
    .map(node => ({
      ...node,
      recognition: toObjectArray(node.recognition).slice(0, 12),
      next_list: toObjectArray(node.next_list).slice(0, 8),
    }))

  const signalLines = (() => {
    const raw = context.signalLines as Record<string, unknown> | null | undefined
    if (!raw || typeof raw !== 'object') return raw ?? null
    return {
      ...raw,
      lines: toObjectArray(raw.lines).slice(0, 60),
    }
  })()

  const eventChainDiagnostics = {
    ...eventChainDiagnosticsRaw,
    onErrorChains: toObjectArray(eventChainDiagnosticsRaw.onErrorChains)
      .slice(0, 8)
      .map(chain => ({
        ...chain,
        steps: toObjectArray(chain.steps).slice(0, 6),
        fallbackListPreview: Array.isArray(chain.fallbackListPreview)
          ? (chain.fallbackListPreview as unknown[]).slice(0, 4)
          : [],
      })),
    nextRecognitionChains: toObjectArray(eventChainDiagnosticsRaw.nextRecognitionChains)
      .slice(0, 8)
      .map(chain => ({
        ...chain,
        steps: toObjectArray(chain.steps).slice(0, 6),
        nextCandidates: toObjectArray(chain.nextCandidates).slice(0, 6),
      })),
    actionFailureChains: toObjectArray(eventChainDiagnosticsRaw.actionFailureChains)
      .slice(0, 6)
      .map(chain => ({
        ...chain,
        steps: toObjectArray(chain.steps).slice(0, 6),
      })),
  }

  const stopTerminationDiagnostics = {
    ...stopTerminationDiagnosticsRaw,
    stopSignals: toObjectArray(stopTerminationDiagnosticsRaw.stopSignals).slice(0, 6),
  }

  const nextCandidateAvailabilityDiagnostics = {
    ...nextCandidateAvailabilityDiagnosticsRaw,
    noHitFailureByNode: toObjectArray(nextCandidateAvailabilityDiagnosticsRaw.noHitFailureByNode).slice(0, 6),
    partialMissRecoveredByNode: toObjectArray(nextCandidateAvailabilityDiagnosticsRaw.partialMissRecoveredByNode).slice(0, 6),
    suspiciousCases: toObjectArray(nextCandidateAvailabilityDiagnosticsRaw.suspiciousCases)
      .slice(0, 6)
      .map(item => ({
        ...item,
        steps: toObjectArray(item.steps).slice(0, 4),
      })),
  }

  const anchorResolutionDiagnostics = {
    ...anchorResolutionDiagnosticsRaw,
    suspiciousCases: toObjectArray(anchorResolutionDiagnosticsRaw.suspiciousCases)
      .slice(0, 6)
      .map(item => ({
        ...item,
        steps: toObjectArray(item.steps).slice(0, 4),
      })),
  }

  const jumpBackFlowDiagnostics = {
    ...jumpBackFlowDiagnosticsRaw,
    terminalBounceCases: toObjectArray(jumpBackFlowDiagnosticsRaw.terminalBounceCases).slice(0, 6),
    pairStats: toObjectArray(jumpBackFlowDiagnosticsRaw.pairStats).slice(0, 8),
    suspiciousCases: toObjectArray(jumpBackFlowDiagnosticsRaw.suspiciousCases)
      .slice(0, 6)
      .map(item => ({
        ...item,
        steps: toObjectArray(item.steps).slice(0, 4),
      })),
  }

  const nestedActionDiagnostics = {
    ...nestedActionDiagnosticsRaw,
    topParentNodes: toObjectArray(nestedActionDiagnosticsRaw.topParentNodes).slice(0, 6),
  }

  const selectedNodeFocus = (() => {
    if (!selectedNodeFocusRaw || typeof selectedNodeFocusRaw !== 'object') return selectedNodeFocusRaw ?? null
    const nodeRaw = (selectedNodeFocusRaw.node as Record<string, unknown> | undefined) ?? {}
    const selectedFlowItemRaw = (selectedNodeFocusRaw.selectedFlowItem as Record<string, unknown> | null | undefined) ?? null
    return {
      ...selectedNodeFocusRaw,
      node: {
        ...nodeRaw,
        nextListPreview: toObjectArray(nodeRaw.nextListPreview).slice(0, 6),
        topRecognitionNames: toObjectArray(nodeRaw.topRecognitionNames).slice(0, 6),
        topNestedRecognitionNames: toObjectArray(nodeRaw.topNestedRecognitionNames).slice(0, 6),
        topNestedActionNames: toObjectArray(nodeRaw.topNestedActionNames).slice(0, 6),
      },
      selectedFlowItem: selectedFlowItemRaw
        ? {
            ...selectedFlowItemRaw,
            ancestry: toObjectArray(selectedFlowItemRaw.ancestry).slice(0, 8),
          }
        : selectedFlowItemRaw,
    }
  })()

  return {
    ...context,
    selectedNodeFocus,
    taskOverview: toObjectArray(context.taskOverview).slice(-10),
    selectedNodeTimeline,
    selectedEventTail: toObjectArray(context.selectedEventTail).slice(-20),
    failureCandidates: toObjectArray(context.failureCandidates).slice(0, 24),
    timelineDiagnostics: {
      ...timelineDiagnostics,
      longStayNodes: toObjectArray(timelineDiagnostics.longStayNodes).slice(0, 8),
      recoFailuresByName: toObjectArray(timelineDiagnostics.recoFailuresByName).slice(0, 12),
      repeatedRuns: toObjectArray(timelineDiagnostics.repeatedRuns).slice(0, 8),
      hotspotRecoPairs: toObjectArray(timelineDiagnostics.hotspotRecoPairs).slice(0, 10),
    },
    deterministicFindings: {
      ...deterministicFindings,
      findings: toObjectArray(deterministicFindings.findings).slice(0, 6),
      unknowns: Array.isArray(deterministicFindings.unknowns)
        ? (deterministicFindings.unknowns as unknown[]).slice(0, 4)
        : [],
    },
    signalLines,
    eventChainDiagnostics,
    stopTerminationDiagnostics,
    nextCandidateAvailabilityDiagnostics,
    anchorResolutionDiagnostics,
    jumpBackFlowDiagnostics,
    nestedActionDiagnostics,
    questionNodeDiagnostics: toObjectArray(context.questionNodeDiagnostics)
      .slice(0, 6)
      .map(item => ({
        ...item,
        topFailedRecognition: toObjectArray(item.topFailedRecognition).slice(0, 6),
        jumpBackCandidates: toObjectArray(item.jumpBackCandidates).slice(0, 6),
        actionKinds: toObjectArray(item.actionKinds).slice(0, 4),
      })),
    knowledge: toObjectArray(context.knowledge).slice(0, 16),
  }
}
