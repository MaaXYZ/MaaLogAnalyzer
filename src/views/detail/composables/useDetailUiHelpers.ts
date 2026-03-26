import { computed } from 'vue'
import { isTauri } from '../../../utils/platform'
import { getSettings } from '../../../utils/settings'

export const useDetailUiHelpers = () => {
  const settings = getSettings()

  const rawJsonDefaultExpanded = computed(() =>
    settings.defaultExpandRawJson
      ? ['reco-json', 'action-json', 'task-json', 'node-definition', 'node-json']
      : [],
  )

  const convertFileSrc = (filePath: string) => {
    if (!isTauri()) return filePath
    return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
  }

  const resolveImageSrc = (source: string) => {
    const normalized = source.trim()
    if (!normalized) return normalized
    if (normalized.startsWith('data:') || normalized.startsWith('blob:') || /^https?:\/\//i.test(normalized)) {
      return normalized
    }
    return convertFileSrc(normalized)
  }

  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return {
    rawJsonDefaultExpanded,
    resolveImageSrc,
    formatJson,
    copyToClipboard,
  }
}
