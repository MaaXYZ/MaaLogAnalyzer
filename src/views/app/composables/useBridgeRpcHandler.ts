import type { BridgeController, JsonRpcId } from '../../../composables/useBridge'

interface UseBridgeRpcHandlerOptions {
  getBridge: () => BridgeController | null
  bridgeThemeUpdatedEvent: string
  handleRealtimeStart: (params: unknown) => void
  handleRealtimePush: (params: unknown) => void
  handleRealtimeEnd: (params: unknown) => void
  handleRealtimeSnapshotEnd: (params: unknown) => void
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export const useBridgeRpcHandler = (options: UseBridgeRpcHandlerOptions) => {
  const handleBridgeUpdateTheme = (params: unknown) => {
    const payload = asRecord(params)
    if (!payload) return

    if (typeof payload.htmlStyle === 'string') {
      if (payload.htmlStyle.trim()) {
        document.documentElement.setAttribute('style', payload.htmlStyle)
      } else {
        document.documentElement.removeAttribute('style')
      }
    }

    if (typeof payload.bodyClass === 'string') {
      document.body.setAttribute('class', payload.bodyClass)
      if (payload.bodyClass.includes('vscode-')) {
        // VS Code theme should be driven by class + CSS vars, not stale inline styles.
        document.body.removeAttribute('style')
      }
    }

    window.dispatchEvent(new Event(options.bridgeThemeUpdatedEvent))
  }

  const handleJsonRpcMethod = async (method: string, params: unknown, id?: JsonRpcId) => {
    const bridge = options.getBridge()
    switch (method) {
      case 'bridge.hello':
        bridge?.sendReady()
        if (id !== undefined) bridge?.sendResult(id, { ok: true })
        return
      case 'bridge.updateTheme':
        handleBridgeUpdateTheme(params)
        if (id !== undefined) bridge?.sendResult(id, { ok: true })
        return
      case 'realtime.start':
        options.handleRealtimeStart(params)
        if (id !== undefined) bridge?.sendResult(id, { ok: true })
        return
      case 'realtime.push':
        options.handleRealtimePush(params)
        if (id !== undefined) bridge?.sendResult(id, { ok: true })
        return
      case 'realtime.end':
        options.handleRealtimeEnd(params)
        if (id !== undefined) bridge?.sendResult(id, { ok: true })
        return
      case 'realtime.snapshot.end':
        options.handleRealtimeSnapshotEnd(params)
        if (id !== undefined) bridge?.sendResult(id, { ok: true })
        return
      default:
        if (id !== undefined) {
          bridge?.sendError(id, -32601, `Method not found: ${method}`)
        }
    }
  }

  return {
    handleJsonRpcMethod,
  }
}
