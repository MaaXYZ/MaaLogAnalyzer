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
  timeoutMs?: number
}

export interface ChatCompletionResult {
  text: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  raw: unknown
}

interface ChatCompletionResponse {
  choices?: Array<{
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

export async function requestChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const baseUrl = trimTrailingSlash(options.baseUrl.trim())
  const apiKey = options.apiKey.trim()
  const model = options.model.trim()

  if (!baseUrl) throw new Error('未配置 API Base URL')
  if (!apiKey) throw new Error('未配置 API Key')
  if (!model) throw new Error('未配置模型名称')

  const controller = new AbortController()
  const timeoutMs = Math.max(3000, options.timeoutMs ?? 45000)
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1200,
      }),
    })

    const rawText = await response.text()
    let data: ChatCompletionResponse | null = null
    try {
      data = rawText ? (JSON.parse(rawText) as ChatCompletionResponse) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      const detail = data && typeof data === 'object' ? JSON.stringify(data) : rawText
      throw new Error(`请求失败 (${response.status}): ${detail || response.statusText}`)
    }

    const content = pickResponseText(data)
    if (!content.trim()) {
      throw new Error('模型返回为空，请检查模型或请求参数')
    }

    return {
      text: content,
      usage: {
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens,
        totalTokens: data?.usage?.total_tokens,
      },
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
