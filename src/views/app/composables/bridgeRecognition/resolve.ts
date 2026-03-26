import {
  parseCachedImageRefs,
  parseInlineRecoImages,
  type BridgeCachedImageRefs,
} from '../../utils/bridgeImageParsing'

interface ResolveBridgeRecognitionImagesOptions {
  recoData: unknown
  sessionId: string
  taskId: number
  loadCachedImageDataUrl: (sessionId: string, taskId: number, imageRefId: number) => Promise<string | null>
}

interface ResolveBridgeRecognitionImagesResult {
  refs: BridgeCachedImageRefs
  raw: string | null
  draws: string[]
  requestedRaw: boolean
  requestedDrawCount: number
}

export const resolveBridgeRecognitionImages = async (
  options: ResolveBridgeRecognitionImagesOptions,
): Promise<ResolveBridgeRecognitionImagesResult> => {
  const refs = parseCachedImageRefs(options.recoData)
  const inlineImages = parseInlineRecoImages(options.recoData)

  const rawPromise = inlineImages.raw
    ? Promise.resolve<string | null>(inlineImages.raw)
    : refs.raw != null
      ? options.loadCachedImageDataUrl(options.sessionId, options.taskId, refs.raw)
      : Promise.resolve<string | null>(null)

  const drawPromises = inlineImages.draws.length > 0
    ? inlineImages.draws.map((item) => Promise.resolve<string | null>(item))
    : refs.draws.map((refId) => options.loadCachedImageDataUrl(options.sessionId, options.taskId, refId))

  const raw = await rawPromise.catch(() => null)
  const drawResults = await Promise.all(drawPromises.map(async (promise) => {
    try {
      return await promise
    } catch {
      return null
    }
  }))

  const draws = drawResults.filter((item): item is string => typeof item === 'string' && item.length > 0)
  const requestedRaw = !!inlineImages.raw || refs.raw != null
  const requestedDrawCount = inlineImages.draws.length > 0 ? inlineImages.draws.length : refs.draws.length

  return {
    refs,
    raw,
    draws,
    requestedRaw,
    requestedDrawCount,
  }
}
