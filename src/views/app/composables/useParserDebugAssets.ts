import type { LogParser } from '../../../utils/logParser'

interface UseParserDebugAssetsOptions {
  parser: LogParser
}

export const useParserDebugAssets = (options: UseParserDebugAssetsOptions) => {
  let activeErrorImages: Map<string, string> = new Map()
  let activeVisionImages: Map<string, string> = new Map()
  let activeWaitFreezesImages: Map<string, string> = new Map()

  const revokeBlobUrls = (images?: Map<string, string> | null) => {
    if (!images) return
    for (const value of images.values()) {
      if (typeof value === 'string' && value.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(value)
        } catch {
          // ignore revoke failures
        }
      }
    }
  }

  const resetParserDebugAssets = (
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
  ) => {
    // Release previous blob URLs before replacing references.
    if (activeErrorImages !== errorImages) {
      revokeBlobUrls(activeErrorImages)
    }
    if (activeVisionImages !== visionImages) {
      revokeBlobUrls(activeVisionImages)
    }
    if (activeWaitFreezesImages !== waitFreezesImages) {
      revokeBlobUrls(activeWaitFreezesImages)
    }

    activeErrorImages = errorImages ?? new Map()
    activeVisionImages = visionImages ?? new Map()
    activeWaitFreezesImages = waitFreezesImages ?? new Map()

    // Always reset parser maps, avoid carrying stale image mappings across reloads.
    options.parser.setErrorImages(activeErrorImages)
    options.parser.setVisionImages(activeVisionImages)
    options.parser.setWaitFreezesImages(activeWaitFreezesImages)
  }

  return {
    resetParserDebugAssets,
  }
}
