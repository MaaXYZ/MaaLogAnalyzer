import { useMessage } from 'naive-ui'
import { getSettings, saveSettings, getDefaultSettings } from '../../../utils/settings'
import { getAiSettings, saveAiSettings, getDefaultAiSettings } from '../../../utils/aiSettings'

export const useSettingsState = () => {
  const message = useMessage()
  const settings = getSettings()
  const aiSettings = getAiSettings()

  const playbackSpeedOptions = [
    { label: '慢速 1500ms', value: 1500 },
    { label: '标准 900ms', value: 900 },
    { label: '快速 600ms', value: 600 },
    { label: '极速 350ms', value: 350 },
  ]

  const focusZoomOptions = [
    { label: '0.8x', value: 0.8 },
    { label: '1.0x', value: 1.0 },
    { label: '1.2x', value: 1.2 },
    { label: '1.4x', value: 1.4 },
    { label: '1.6x', value: 1.6 },
  ]

  const handleSave = () => {
    saveSettings(settings)
    saveAiSettings(aiSettings)
    message.success('设置已保存')
  }

  const handleReset = () => {
    Object.assign(settings, getDefaultSettings())
    Object.assign(aiSettings, getDefaultAiSettings())
    saveSettings(settings)
    saveAiSettings(aiSettings)
    message.success('已恢复默认设置')
  }

  return {
    settings,
    aiSettings,
    playbackSpeedOptions,
    focusZoomOptions,
    handleSave,
    handleReset,
  }
}
