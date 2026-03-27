import { onMounted, onUnmounted } from 'vue'
import { decodeBase64ImageEntries } from '../../utils/fileLoadingHelpers'
import type { UseProcessFileLoaderOptions } from './types'

interface VSCodeBridgePayload {
  type: string
  content?: string
  errorImages?: Array<{ key: string, base64: string }>
  visionImages?: Array<{ key: string, base64: string }>
  waitFreezesImages?: Array<{ key: string, base64: string }>
}

export const useVSCodeBridge = (
  options: UseProcessFileLoaderOptions,
  isInVSCode: () => boolean,
) => {
  const handleVSCodeOpen = () => {
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({ type: 'openFile' })
    } else {
      console.error('[VS Code] vscodeApi not available')
    }
  }

  const handleVSCodeOpenFolder = () => {
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({ type: 'openFolder' })
    } else {
      console.error('[VS Code] vscodeApi not available')
    }
  }

  const handleVSCodeMessage = (event: MessageEvent) => {
    const message = event.data as VSCodeBridgePayload
    if (message.type === 'loadFile' && message.content) {
      options.onFileLoadingStart()
      const errorImages = decodeBase64ImageEntries(message.errorImages, 'image/png')
      const visionImages = decodeBase64ImageEntries(message.visionImages, 'image/jpeg')
      const waitFreezesImages = decodeBase64ImageEntries(message.waitFreezesImages, 'image/jpeg')
      options.onUploadContent(message.content, errorImages, visionImages, waitFreezesImages)
      options.onFileLoadingEnd()
      return
    }

    if (message.type === 'loadZipFile' && message.content) {
      options.onFileLoadingStart()
      const errorImages = decodeBase64ImageEntries(message.errorImages, 'image/png')
      const visionImages = decodeBase64ImageEntries(message.visionImages, 'image/jpeg')
      const waitFreezesImages = decodeBase64ImageEntries(message.waitFreezesImages, 'image/jpeg')
      options.onUploadContent(message.content, errorImages, visionImages, waitFreezesImages)
      options.onFileLoadingEnd()
    }
  }

  onMounted(() => {
    if (isInVSCode()) {
      window.addEventListener('message', handleVSCodeMessage)
    }
  })

  onUnmounted(() => {
    if (isInVSCode()) {
      window.removeEventListener('message', handleVSCodeMessage)
    }
  })

  return {
    handleVSCodeOpen,
    handleVSCodeOpenFolder,
  }
}
