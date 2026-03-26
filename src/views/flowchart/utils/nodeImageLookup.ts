import { isTauri } from '../../../utils/platform'
import { buildNodeFlowItems, buildNodeRecognitionAttempts } from '../../../utils/nodeFlow'
import type { NodeInfo, RecognitionAttempt, UnifiedFlowItem } from '../../../types'
import type { LogParser } from '../../../utils/logParser'

export const convertFileSrc = (filePath: string) => {
  if (!isTauri()) return filePath
  return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
}

function findImageInAttempts(attempts: RecognitionAttempt[]): string | undefined {
  for (let i = attempts.length - 1; i >= 0; i--) {
    const attempt = attempts[i]
    if (attempt.vision_image) return attempt.vision_image
    if (attempt.error_image) return attempt.error_image
    if (attempt.nested_nodes) {
      const image = findImageInAttempts(attempt.nested_nodes)
      if (image) return image
    }
  }
  return undefined
}

function findImageInFlowItems(items: UnifiedFlowItem[] | undefined): string | undefined {
  if (!items || items.length === 0) return undefined
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.type === 'recognition' || item.type === 'recognition_node') {
      if (item.vision_image) return item.vision_image
      if (item.error_image) return item.error_image
    }
    const nested = findImageInFlowItems(item.children)
    if (nested) return nested
  }
  return undefined
}

export function findNodeInfoImage(info: NodeInfo, parser?: LogParser): string | undefined {
  if (info.error_image) return info.error_image

  const recognitionAttempts = buildNodeRecognitionAttempts(info)
  const recognitionImage = findImageInAttempts(recognitionAttempts)
  if (recognitionImage) return recognitionImage

  const nodeFlowImage = findImageInFlowItems(buildNodeFlowItems(info))
  if (nodeFlowImage) return nodeFlowImage

  if (parser) {
    const nodeErr = parser.findErrorImage(info.ts, info.name)
    if (nodeErr) return nodeErr

    const flowItems = buildNodeFlowItems(info)
    const stack: UnifiedFlowItem[] = [...flowItems]
    while (stack.length > 0) {
      const item = stack.pop()!
      if (item.type === 'recognition' || item.type === 'recognition_node') {
        const recoId = item.reco_id ?? item.reco_details?.reco_id
        if (recoId != null) {
          const vision = parser.findVisionImage(item.ts, item.name, recoId)
          if (vision) return vision
        }
        const recognition = parser.findRecognitionImage(item.ts, item.name)
        if (recognition) return recognition
      } else {
        const err = parser.findErrorImage(item.ts, item.name)
        if (err) return err
      }
      if (item.children && item.children.length > 0) {
        stack.push(...item.children)
      }
    }

    for (let i = recognitionAttempts.length - 1; i >= 0; i--) {
      const attempt = recognitionAttempts[i]
      const vision = parser.findVisionImage(attempt.ts, attempt.name, attempt.reco_id)
      if (vision) return vision
      const recognition = parser.findRecognitionImage(attempt.ts, attempt.name)
      if (recognition) return recognition
    }
  }

  return undefined
}
