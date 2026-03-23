import { onBeforeUnmount, onMounted } from 'vue'

export type JsonRpcId = string | number | null

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

interface JsonRpcResponseSuccess {
  jsonrpc: '2.0'
  id: JsonRpcId
  result: unknown
}

interface JsonRpcResponseError {
  jsonrpc: '2.0'
  id: JsonRpcId
  error: {
    code: number
    message: string
    data?: unknown
  }
}

type JsonRpcMethodMessage = JsonRpcNotification | JsonRpcRequest
type JsonRpcMessage = JsonRpcMethodMessage | JsonRpcResponseSuccess | JsonRpcResponseError

interface UseBridgeOptions {
  enabled: boolean
  from: string
  capabilities: string[]
  readyPayload?: Record<string, unknown>
  onMethod: (method: string, params: unknown, id?: JsonRpcId) => void | Promise<void>
}

export interface BridgeController {
  readonly enabled: boolean
  sendNotification: (method: string, params?: unknown) => void
  sendResult: (id: JsonRpcId, result: unknown) => void
  sendError: (id: JsonRpcId, code: number, messageText: string, data?: unknown) => void
  sendReady: () => void
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const toJsonRpcMessage = (raw: unknown): JsonRpcMessage | null => {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
  }

  const record = asRecord(parsed)
  if (!record || record.jsonrpc !== '2.0') return null

  if (typeof record.method === 'string') {
    if (Object.prototype.hasOwnProperty.call(record, 'id')) {
      return {
        jsonrpc: '2.0',
        id: (record.id as JsonRpcId) ?? null,
        method: record.method,
        params: record.params,
      }
    }
    return {
      jsonrpc: '2.0',
      method: record.method,
      params: record.params,
    }
  }

  if (Object.prototype.hasOwnProperty.call(record, 'id')) {
    if (Object.prototype.hasOwnProperty.call(record, 'error')) {
      const errorRecord = asRecord(record.error)
      if (!errorRecord || typeof errorRecord.code !== 'number' || typeof errorRecord.message !== 'string') {
        return null
      }
      return {
        jsonrpc: '2.0',
        id: (record.id as JsonRpcId) ?? null,
        error: {
          code: errorRecord.code,
          message: errorRecord.message,
          data: errorRecord.data,
        },
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, 'result')) {
      return {
        jsonrpc: '2.0',
        id: (record.id as JsonRpcId) ?? null,
        result: record.result,
      }
    }
  }

  return null
}

export const useBridge = (options: UseBridgeOptions): BridgeController => {
  const postToParent = (payload: JsonRpcMessage) => {
    if (!options.enabled) return
    if (window.parent === window) return
    window.parent.postMessage(JSON.stringify(payload), '*')
  }

  const sendNotification = (method: string, params?: unknown) => {
    const payload: JsonRpcNotification = { jsonrpc: '2.0', method }
    if (params !== undefined) payload.params = params
    postToParent(payload)
  }

  const sendResult = (id: JsonRpcId, result: unknown) => {
    postToParent({ jsonrpc: '2.0', id, result })
  }

  const sendError = (id: JsonRpcId, code: number, messageText: string, data?: unknown) => {
    const payload: JsonRpcResponseError = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message: messageText,
      },
    }
    if (data !== undefined) payload.error.data = data
    postToParent(payload)
  }

  const sendReady = () => {
    const payload: Record<string, unknown> = {
      protocolVersion: 1,
      from: options.from,
      capabilities: options.capabilities,
    }
    if (options.readyPayload) {
      Object.assign(payload, options.readyPayload)
    }
    sendNotification('bridge.ready', payload)
  }

  const handleMessageEvent = (event: MessageEvent) => {
    if (window.parent !== window && event.source !== window.parent && event.source !== window) return
    const message = toJsonRpcMessage(event.data)
    if (!message || !('method' in message)) return

    if ('id' in message) {
      void options.onMethod(message.method, message.params, message.id)
    } else {
      void options.onMethod(message.method, message.params)
    }
  }

  onMounted(() => {
    if (!options.enabled) return
    window.addEventListener('message', handleMessageEvent)
    sendReady()
  })

  onBeforeUnmount(() => {
    if (!options.enabled) return
    window.removeEventListener('message', handleMessageEvent)
  })

  return {
    enabled: options.enabled,
    sendNotification,
    sendResult,
    sendError,
    sendReady,
  }
}
