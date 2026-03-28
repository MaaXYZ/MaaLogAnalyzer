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

  const copyWithExecCommand = (text: string): boolean => {
    if (typeof document === 'undefined' || !document.body) return false

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)

    const selection = document.getSelection()
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    textarea.focus()
    textarea.select()

    let copied = false
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }

    document.body.removeChild(textarea)

    if (selection) {
      selection.removeAllRanges()
      if (previousRange) {
        selection.addRange(previousRange)
      }
    }

    return copied
  }

  const copyViaVSCodeHost = (text: string): boolean => {
    if (typeof window === 'undefined' || !window.vscodeApi?.postMessage) return false
    try {
      window.vscodeApi.postMessage({ type: 'copyText', text })
      return true
    } catch {
      return false
    }
  }

  const copyToClipboard = (text: string) => {
    const target = text ?? ''
    if (!target) return

    const runCopy = async () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(target)
          return
        } catch {
          // Fall through to fallback copy implementations.
        }
      }

      if (copyWithExecCommand(target)) return
      copyViaVSCodeHost(target)
    }

    void runCopy()
  }

  return {
    rawJsonDefaultExpanded,
    resolveImageSrc,
    formatJson,
    copyToClipboard,
  }
}
