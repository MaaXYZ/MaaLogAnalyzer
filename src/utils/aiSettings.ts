import { reactive } from 'vue'

export interface AiSettings {
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  maxTokensAuto: boolean
  streamResponse: boolean
  includeKnowledgePack: boolean
  includeSignalLines: boolean
}

const AI_SETTINGS_KEY = 'maa-log-analyzer-ai-settings'
const AI_SESSION_KEY = 'maa-log-analyzer-ai-session-key'

const defaultAiSettings: AiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  maxTokens: 4096,
  maxTokensAuto: true,
  streamResponse: true,
  includeKnowledgePack: true,
  includeSignalLines: true,
}

export function getDefaultAiSettings(): AiSettings {
  return { ...defaultAiSettings }
}

let aiSettingsInstance: AiSettings | null = null

export function getAiSettings(): AiSettings {
  if (aiSettingsInstance) return aiSettingsInstance

  let stored: Partial<AiSettings> = {}
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY)
    if (raw) stored = JSON.parse(raw)
  } catch (error) {
    console.error('读取 AI 设置失败:', error)
  }

  aiSettingsInstance = reactive<AiSettings>({
    ...getDefaultAiSettings(),
    ...stored,
  })

  return aiSettingsInstance
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('保存 AI 设置失败:', error)
  }
  if (aiSettingsInstance && aiSettingsInstance !== settings) {
    Object.assign(aiSettingsInstance, settings)
  }
}

export function getSessionApiKey(): string {
  try {
    return sessionStorage.getItem(AI_SESSION_KEY) || ''
  } catch {
    return ''
  }
}

export function setSessionApiKey(value: string): void {
  try {
    if (!value) {
      sessionStorage.removeItem(AI_SESSION_KEY)
      return
    }
    sessionStorage.setItem(AI_SESSION_KEY, value)
  } catch {
    // ignore write errors
  }
}
