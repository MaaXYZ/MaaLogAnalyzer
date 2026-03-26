import { watch, type Ref } from 'vue'
import { saveAiSettings, setSessionApiKey, type AiSettings } from '../../../utils/aiSettings'

interface UseAiSettingsSyncOptions {
  apiKey: Ref<string>
  settings: AiSettings
  clearSessionApiKey: () => void
  message: {
    success: (content: string) => void
  }
}

export const useAiSettingsSync = (options: UseAiSettingsSyncOptions) => {
  watch(options.apiKey, (value) => {
    setSessionApiKey(value)
  })

  watch(
    () => [options.settings.includeSelectedNodeFocus, options.settings.knowledgeBootstrap],
    () => {
      saveAiSettings(options.settings)
    }
  )

  const clearApiKey = () => {
    options.apiKey.value = ''
    options.clearSessionApiKey()
    options.message.success('已清空会话 API Key')
  }

  return {
    clearApiKey,
  }
}
