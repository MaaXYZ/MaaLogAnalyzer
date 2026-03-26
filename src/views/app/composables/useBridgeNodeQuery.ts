import type { BridgeController } from '../../../composables/useBridge'

export interface QueryNodeResult {
  task: string
  data: string | null
}

interface UseBridgeNodeQueryOptions {
  isVscodeLaunchEmbed: boolean
  getBridge: () => BridgeController | null
  getSessionId: () => string | null | undefined
  asRecord: (value: unknown) => Record<string, unknown> | null
  toTrimmedNonEmptyString: (value: unknown) => string | null
}

export const useBridgeNodeQuery = (options: UseBridgeNodeQueryOptions) => {
  const getBridgeSessionId = (): string | null => {
    const bridge = options.getBridge()
    if (!options.isVscodeLaunchEmbed || !bridge?.enabled) return null
    return options.toTrimmedNonEmptyString(options.getSessionId()) ?? null
  }

  const queryBridgeNode = async (sessionId: string, task: string): Promise<QueryNodeResult> => {
    const bridge = options.getBridge()
    if (!bridge?.enabled) {
      throw new Error('Bridge is disabled')
    }
    const result = await bridge.sendRequest('query.node', {
      sessionId,
      task,
    }, { timeoutMs: 12000 })
    const record = options.asRecord(result)
    if (!record) {
      throw new Error('Invalid query.node response')
    }
    const returnedTask = options.toTrimmedNonEmptyString(record.task) ?? task
    const data = record.data
    return {
      task: returnedTask,
      data: typeof data === 'string' ? data : data == null ? null : JSON.stringify(data, null, 2),
    }
  }

  return {
    getBridgeSessionId,
    queryBridgeNode,
  }
}
