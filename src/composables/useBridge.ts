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

interface SendRequestOptions {
  timeoutMs?: number
}

export interface BridgeController {
  readonly enabled: boolean
  sendNotification: (method: string, params?: unknown) => void
  sendRequest: (method: string, params?: unknown, options?: SendRequestOptions) => Promise<unknown>
  sendResult: (id: JsonRpcId, result: unknown) => void
  sendError: (id: JsonRpcId, code: number, messageText: string, data?: unknown) => void
  sendReady: () => void
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timer: number | null
}

const DEFAULT_REQUEST_TIMEOUT_MS = 8000

const toRequestKey = (id: JsonRpcId): string => {
  if (id === null) return 'null'
  return `${typeof id}:${String(id)}`
}

class JsonRpcRequestError extends Error {
  code: number
  data?: unknown

  constructor(code: number, messageText: string, data?: unknown) {
    super(messageText)
    this.name = 'JsonRpcRequestError'
    this.code = code
    this.data = data
  }
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
      if (
        !errorRecord ||
        typeof errorRecord.code !== 'number' ||
        typeof errorRecord.message !== 'string'
      ) {
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
  const pendingRequests = new Map<string, PendingRequest>()
  let nextRequestId = 1

  const postToParent = (payload: JsonRpcMessage) => {
    if (!options.enabled) return
    if (window.parent === window) return
    window.parent.postMessage(JSON.stringify(payload), '*')
  }

  const sendNotification = (method: string, params?: unknown) => {
    if (!options.enabled) return
    const payload: JsonRpcNotification = { jsonrpc: '2.0', method }
    if (params !== undefined) payload.params = params
    postToParent(payload)
  }

  const sendRequest = (
    method: string,
    params?: unknown,
    requestOptions?: SendRequestOptions,
  ): Promise<unknown> => {
    if (!options.enabled) {
      return Promise.reject(new Error('Bridge is disabled'))
    }
    if (window.parent === window) {
      return Promise.reject(new Error('Bridge parent is unavailable'))
    }

    const id = nextRequestId
    nextRequestId += 1

    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
    }
    if (params !== undefined) payload.params = params

    return new Promise((resolve, reject) => {
      const timeoutMs = requestOptions?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
      const key = toRequestKey(id)
      const timer = window.setTimeout(() => {
        pendingRequests.delete(key)
        reject(new Error(`Bridge request timeout: ${method}`))
      }, timeoutMs)

      pendingRequests.set(key, { resolve, reject, timer })
      postToParent(payload)
    })
  }

  const sendResult = (id: JsonRpcId, result: unknown) => {
    if (!options.enabled) return
    postToParent({ jsonrpc: '2.0', id, result })
  }

  const sendError = (id: JsonRpcId, code: number, messageText: string, data?: unknown) => {
    if (!options.enabled) return
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
    if (!options.enabled) return
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

  const settlePendingRequest = (id: JsonRpcId, settle: (request: PendingRequest) => void) => {
    const key = toRequestKey(id)
    const pending = pendingRequests.get(key)
    if (!pending) return
    pendingRequests.delete(key)
    if (pending.timer != null) {
      window.clearTimeout(pending.timer)
    }
    settle(pending)
  }

  const rejectAllPendingRequests = (reason: Error) => {
    for (const [key, pending] of pendingRequests.entries()) {
      pendingRequests.delete(key)
      if (pending.timer != null) {
        window.clearTimeout(pending.timer)
      }
      pending.reject(reason)
    }
  }

  const handleMessageEvent = (event: MessageEvent) => {
    if (window.parent !== window && event.source !== window.parent && event.source !== window)
      return
    const message = toJsonRpcMessage(event.data)
    if (!message) return

    if ('method' in message) {
      if ('id' in message) {
        void options.onMethod(message.method, message.params, message.id)
      } else {
        void options.onMethod(message.method, message.params)
      }
      return
    }

    if ('error' in message) {
      settlePendingRequest(message.id, (pending) => {
        pending.reject(
          new JsonRpcRequestError(message.error.code, message.error.message, message.error.data),
        )
      })
      return
    }

    settlePendingRequest(message.id, (pending) => {
      pending.resolve(message.result)
    })
  }

  onMounted(() => {
    if (!options.enabled) return
    window.addEventListener('message', handleMessageEvent)
    sendReady()
  })

  onBeforeUnmount(() => {
    if (!options.enabled) return
    window.removeEventListener('message', handleMessageEvent)
    rejectAllPendingRequests(new Error('Bridge controller disposed'))
  })

  return {
    enabled: options.enabled,
    sendNotification,
    sendRequest,
    sendResult,
    sendError,
    sendReady,
  }
}
