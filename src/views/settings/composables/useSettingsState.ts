import { reactive, watch, type Ref } from 'vue'
import { useMessage } from 'naive-ui'
import { getSettings, saveSettings, getDefaultSettings } from '../../../utils/settings'
import { resetPersistedLayouts } from '../../../utils/layoutPersistence'

export const useSettingsState = (show?: Ref<boolean>) => {
  const message = useMessage()
  const persistedSettings = getSettings()
  const settings = reactive({ ...persistedSettings })

  const reloadDraft = () => {
    Object.assign(settings, persistedSettings)
  }

  if (show) {
    watch(
      show,
      (visible) => {
        if (visible) reloadDraft()
      },
      { flush: 'sync' },
    )
  }

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
    reloadDraft()
    message.success('设置已保存')
  }

  const handleReset = () => {
    Object.assign(settings, getDefaultSettings())
    saveSettings(settings)
    resetPersistedLayouts()
    message.success('已恢复默认设置')
  }

  return {
    settings,
    playbackSpeedOptions,
    focusZoomOptions,
    handleSave,
    handleReset,
  }
}
