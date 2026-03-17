export type AiRole = 'system' | 'user' | 'assistant'

export interface AiChatMessage {
  role: AiRole
  content: string
}

export interface ChatCompletionOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: AiChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  onDelta?: (deltaText: string, fullText: string) => void
  responseFormatJson?: boolean
  retryOnLength?: boolean
  maxNetworkRetries?: number
  timeoutMs?: number
}

export interface ChatCompletionResult {
  text: string
  finishReason?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  raw: unknown
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

const normalizeMessageText = (payload: unknown): string => {
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object' && payload !== null) {
    const text = (payload as { text?: unknown }).text
    if (typeof text === 'string') return text
  }
  if (!Array.isArray(payload)) return ''

  const parts: string[] = []
  for (const item of payload) {
    if (typeof item !== 'object' || item === null) continue
    const text = (item as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) {
      parts.push(text)
    }
  }
  return parts.join('\n')
}

const pickResponseText = (data: ChatCompletionResponse | null): string => {
  const message = data?.choices?.[0]?.message
  if (!message) return ''

  const content = normalizeMessageText(message.content)
  if (content.trim()) return content
  return ''
}

const toResultUsage = (usage?: ChatCompletionResponse['usage']) => {
  if (!usage) return undefined
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }
}

interface StreamReadResult {
  text: string
  finishReason?: string
  usage?: ChatCompletionResponse['usage']
  rawText: string
  rawEvents: unknown[]
}

const readStreamingResponse = async (
  body: ReadableStream<Uint8Array>,
  keepAlive: () => void,
  onDelta?: (deltaText: string, fullText: string) => void
): Promise<StreamReadResult> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let finishReason: string | undefined
  let usage: ChatCompletionResponse['usage'] | undefined
  let rawText = ''
  const rawEvents: unknown[] = []
  let lineBuffer = ''

  const appendText = (piece: string) => {
    if (!piece) return
    text += piece
    onDelta?.(piece, text)
  }

  const handlePayload = (payload: string) => {
    const normalized = payload.trim()
    if (!normalized || normalized === '[DONE]') return

    let chunk: ChatCompletionResponse | null = null
    try {
      chunk = JSON.parse(normalized) as ChatCompletionResponse
    } catch {
      return
    }

    if (rawEvents.length < 24) rawEvents.push(chunk)

    const choice = chunk.choices?.[0]
    if (!choice) return

    const delta = (choice as { delta?: { content?: unknown } }).delta
    const deltaContent = normalizeMessageText(delta?.content)
    if (deltaContent) appendText(deltaContent)

    if (!deltaContent) {
      const messageContent = normalizeMessageText(choice.message?.content)
      // Some providers may send a full message in one chunk when stream=true.
      if (messageContent && !text) appendText(messageContent)
    }

    if (typeof choice.finish_reason === 'string' && choice.finish_reason.trim()) {
      finishReason = choice.finish_reason
    }

    if (chunk.usage) usage = chunk.usage
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      keepAlive()

      const piece = decoder.decode(value, { stream: true })
      rawText += piece
      lineBuffer += piece

      while (true) {
        const lf = lineBuffer.indexOf('\n')
        if (lf < 0) break
        const line = lineBuffer.slice(0, lf).replace(/\r$/, '')
        lineBuffer = lineBuffer.slice(lf + 1)

        if (!line.startsWith('data:')) continue
        handlePayload(line.slice(5))
      }
    }
  } finally {
    reader.releaseLock()
  }

  const tail = decoder.decode()
  if (tail) {
    rawText += tail
    lineBuffer += tail
  }

  const lastLine = lineBuffer.trim()
  if (lastLine.startsWith('data:')) {
    handlePayload(lastLine.slice(5))
  }

  return { text, finishReason, usage, rawText, rawEvents }
}

const parseStreamLikeResponse = (rawText: string): ChatCompletionResponse | null => {
  const lines = rawText.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim()
    if (!line || !line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      return JSON.parse(payload) as ChatCompletionResponse
    } catch {
      continue
    }
  }
  return null
}

class HttpStatusError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string, statusText: string) {
    super(`请求失败 (${status}): ${detail || statusText}`)
    this.name = 'HttpStatusError'
    this.status = status
    this.detail = detail
  }
}

const parseResponseBody = (rawText: string): ChatCompletionResponse | null => {
  try {
    return rawText ? (JSON.parse(rawText) as ChatCompletionResponse) : null
  } catch {
    return parseStreamLikeResponse(rawText)
  }
}

const shouldRetryStatus = (status: number): boolean =>
  status === 429 || (status >= 500 && status <= 599)

const isResponseFormatUnsupported = (status: number, detail: string): boolean => {
  if (status !== 400) return false
  return /(response_format|json_object|unsupported.*response|invalid.*response)/i.test(detail)
}

const isTransientNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError) return true
  if (error instanceof Error) {
    return /(network|fetch|ECONN|ENOTFOUND|socket|timeout|timed out)/i.test(error.message)
  }
  return false
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, ms))

const computeBackoffMs = (attempt: number): number =>
  Math.min(4000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 120)

const computeLengthRetryMaxTokens = (current?: number): number | null => {
  const cap = 8192
  const base = typeof current === 'number' && Number.isFinite(current) && current > 0
    ? Math.floor(current)
    : 1200
  const next = Math.min(cap, Math.max(base + 512, Math.ceil(base * 1.6)))
  if (next <= base) return null
  return next
}

interface SingleRequestOptions {
  baseUrl: string
  apiKey: string
  payload: Record<string, unknown>
  stream: boolean
  onDelta?: (deltaText: string, fullText: string) => void
  timeoutMs: number
}

const runSingleRequest = async (options: SingleRequestOptions): Promise<ChatCompletionResult> => {
  const controller = new AbortController()
  let timer = window.setTimeout(() => controller.abort(), options.timeoutMs)
  const keepAlive = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => controller.abort(), options.timeoutMs)
  }

  try {
    const response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(options.payload),
    })

    if (!response.ok) {
      const rawText = await response.text()
      const data = parseResponseBody(rawText)
      const detail = data && typeof data === 'object' ? JSON.stringify(data) : rawText
      throw new HttpStatusError(response.status, detail || response.statusText, response.statusText)
    }

    if (options.stream && response.body) {
      const streamed = await readStreamingResponse(response.body, keepAlive, options.onDelta)
      let content = streamed.text
      let finishReason = streamed.finishReason
      let usage = streamed.usage

      if (!content.trim()) {
        const data = parseResponseBody(streamed.rawText)
        content = pickResponseText(data)
        finishReason = finishReason || data?.choices?.[0]?.finish_reason
        usage = usage ?? data?.usage
      }

      if (!content.trim()) {
        throw new Error('模型未返回可用 answer 内容（仅思考内容不会被当作答案）')
      }

      return {
        text: content,
        finishReason,
        usage: toResultUsage(usage),
        raw: streamed.rawEvents.length > 0 ? streamed.rawEvents : streamed.rawText,
      }
    }

    const rawText = await response.text()
    const data = parseResponseBody(rawText)
    const content = pickResponseText(data)
    if (!content.trim()) {
      throw new Error('模型未返回可用 answer 内容（仅思考内容不会被当作答案）')
    }

    return {
      text: content,
      finishReason: data?.choices?.[0]?.finish_reason,
      usage: toResultUsage(data?.usage),
      raw: data ?? rawText,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`请求超时（>${options.timeoutMs}ms）`)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

export async function requestChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const baseUrl = trimTrailingSlash(options.baseUrl.trim())
  const apiKey = options.apiKey.trim()
  const model = options.model.trim()
  const timeoutMs = Math.max(3000, options.timeoutMs ?? 45000)
  const stream = options.stream ?? false
  const retryOnLength = options.retryOnLength ?? true
  const maxNetworkRetries = Math.max(0, Math.min(2, Math.floor(options.maxNetworkRetries ?? 1)))

  if (!baseUrl) throw new Error('未配置 API Base URL')
  if (!apiKey) throw new Error('未配置 API Key')
  if (!model) throw new Error('未配置模型名称')

  let maxTokens = typeof options.maxTokens === 'number' && Number.isFinite(options.maxTokens) && options.maxTokens > 0
    ? Math.floor(options.maxTokens)
    : undefined
  let useResponseFormatJson = options.responseFormatJson ?? false
  let retriedLength = false
  let fallbackResponseFormat = false
  let networkRetryCount = 0

  while (true) {
    const payload: Record<string, unknown> = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      stream,
    }
    if (typeof maxTokens === 'number' && maxTokens > 0) {
      payload.max_tokens = maxTokens
    }
    if (useResponseFormatJson) {
      payload.response_format = { type: 'json_object' }
    }

    try {
      const result = await runSingleRequest({
        baseUrl,
        apiKey,
        payload,
        stream,
        onDelta: options.onDelta,
        timeoutMs,
      })

      if (retryOnLength && !retriedLength && result.finishReason === 'length') {
        const nextMaxTokens = computeLengthRetryMaxTokens(maxTokens)
        if (nextMaxTokens && (maxTokens == null || nextMaxTokens > maxTokens)) {
          retriedLength = true
          maxTokens = nextMaxTokens
          continue
        }
      }

      return result
    } catch (error) {
      if (error instanceof HttpStatusError) {
        if (useResponseFormatJson && !fallbackResponseFormat && isResponseFormatUnsupported(error.status, error.detail)) {
          fallbackResponseFormat = true
          useResponseFormatJson = false
          continue
        }

        if (shouldRetryStatus(error.status) && networkRetryCount < maxNetworkRetries) {
          const delayMs = computeBackoffMs(networkRetryCount)
          networkRetryCount += 1
          await sleep(delayMs)
          continue
        }
      }

      if (isTransientNetworkError(error) && networkRetryCount < maxNetworkRetries) {
        const delayMs = computeBackoffMs(networkRetryCount)
        networkRetryCount += 1
        await sleep(delayMs)
        continue
      }

      throw error
    }
  }
}
