import { requestChatCompletion, type ChatCompletionOptions, type ChatCompletionResult } from '../../../ai/client'

type AiRequestMode = 'test' | 'analyze'

interface BuildChatRequestOptionsInput {
  mode: AiRequestMode
  content: string
  systemPrompt: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  streamResponse: boolean
  maxTokensAuto: boolean
  analysisTimeoutMs: number
  onDelta?: (deltaText: string, fullText: string) => void
}

export const buildChatRequestOptions = (
  input: BuildChatRequestOptionsInput,
): ChatCompletionOptions => {
  return {
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    temperature: input.mode === 'test' ? 0 : input.temperature,
    maxTokens: input.mode === 'test' ? 256 : input.maxTokens,
    stream: input.mode === 'analyze' ? input.streamResponse : false,
    responseFormatJson: input.mode === 'analyze',
    retryOnLength: input.mode === 'analyze' && input.maxTokensAuto,
    maxNetworkRetries: input.mode === 'analyze' ? 2 : 1,
    onDelta: input.mode === 'analyze' && input.streamResponse ? input.onDelta : undefined,
    timeoutMs: input.mode === 'test' ? 15000 : input.analysisTimeoutMs,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.content },
    ],
  }
}

export const sendChatRequest = async (
  input: BuildChatRequestOptionsInput,
): Promise<ChatCompletionResult> => {
  const options = buildChatRequestOptions(input)
  return requestChatCompletion(options)
}

export const createSendRequest = (
  input: Omit<BuildChatRequestOptionsInput, 'content'>,
) => {
  return (content: string) => sendChatRequest({
    ...input,
    content,
  })
}

export const createTrackedRequester = (
  sendRequest: (content: string) => Promise<ChatCompletionResult>,
  onTracked: (response: ChatCompletionResult) => void,
) => {
  return async (content: string) => {
    const response = await sendRequest(content)
    onTracked(response)
    return response
  }
}
