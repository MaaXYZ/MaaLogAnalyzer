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
      reasoning_content?: string
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

  // deepseek-reasoner may return empty content with reasoning_content.
  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content
  }

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

    const delta = (choice as { delta?: { content?: unknown; reasoning_content?: unknown } }).delta
    const deltaContent = normalizeMessageText(delta?.content)
    if (deltaContent) appendText(deltaContent)

    if (!deltaContent && typeof delta?.reasoning_content === 'string' && delta.reasoning_content.trim()) {
      appendText(delta.reasoning_content)
    }

    if (!deltaContent) {
      const messageContent = normalizeMessageText(choice.message?.content)
      // Some providers may send a full message in one chunk when stream=true.
      if (messageContent && !text) appendText(messageContent)
      if (!messageContent && typeof choice.message?.reasoning_content === 'string' && choice.message.reasoning_content.trim()) {
        appendText(choice.message.reasoning_content)
      }
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

export async function requestChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const baseUrl = trimTrailingSlash(options.baseUrl.trim())
  const apiKey = options.apiKey.trim()
  const model = options.model.trim()

  if (!baseUrl) throw new Error('未配置 API Base URL')
  if (!apiKey) throw new Error('未配置 API Key')
  if (!model) throw new Error('未配置模型名称')

  const controller = new AbortController()
  const timeoutMs = Math.max(3000, options.timeoutMs ?? 45000)
  let timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const keepAlive = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => controller.abort(), timeoutMs)
  }

  try {
    const stream = options.stream ?? false
    const payload: Record<string, unknown> = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      stream,
    }
    if (typeof options.maxTokens === 'number' && Number.isFinite(options.maxTokens) && options.maxTokens > 0) {
      payload.max_tokens = Math.floor(options.maxTokens)
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const rawText = await response.text()
      let data: ChatCompletionResponse | null = null
      try {
        data = rawText ? (JSON.parse(rawText) as ChatCompletionResponse) : null
      } catch {
        data = parseStreamLikeResponse(rawText)
      }
      const detail = data && typeof data === 'object' ? JSON.stringify(data) : rawText
      throw new Error(`请求失败 (${response.status}): ${detail || response.statusText}`)
    }

    if (stream && response.body) {
      const streamed = await readStreamingResponse(response.body, keepAlive, options.onDelta)
      let content = streamed.text
      let finishReason = streamed.finishReason
      let usage = streamed.usage

      if (!content.trim()) {
        let data: ChatCompletionResponse | null = null
        try {
          data = streamed.rawText ? (JSON.parse(streamed.rawText) as ChatCompletionResponse) : null
        } catch {
          data = parseStreamLikeResponse(streamed.rawText)
        }

        content = pickResponseText(data)
        finishReason = finishReason || data?.choices?.[0]?.finish_reason
        usage = usage ?? data?.usage
      }

      if (!content.trim()) {
        throw new Error('模型返回为空，请检查模型或请求参数')
      }

      return {
        text: content,
        finishReason,
        usage: toResultUsage(usage),
        raw: streamed.rawEvents.length > 0 ? streamed.rawEvents : streamed.rawText,
      }
    }

    const rawText = await response.text()
    let data: ChatCompletionResponse | null = null
    try {
      data = rawText ? (JSON.parse(rawText) as ChatCompletionResponse) : null
    } catch {
      data = parseStreamLikeResponse(rawText)
    }

    const content = pickResponseText(data)
    if (!content.trim()) {
      throw new Error('模型返回为空，请检查模型或请求参数')
    }

    return {
      text: content,
      finishReason: data?.choices?.[0]?.finish_reason,
      usage: toResultUsage(data?.usage),
      raw: data ?? rawText,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`请求超时（>${timeoutMs}ms）`)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}
