import { resolveImageSrcPath } from '../../../utils/imageSrc'
import { buildNodeFlowItems, buildNodeRecognitionAttempts } from '@windsland52/maa-log-parser/node-flow'
import type { NodeInfo, RecognitionAttempt, UnifiedFlowItem } from '../../../types'

export const convertFileSrc = (filePath: string) => {
  return resolveImageSrcPath(filePath)
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

export function findNodeInfoImage(info: NodeInfo): string | undefined {
  if (info.error_image) return info.error_image

  const recognitionAttempts = buildNodeRecognitionAttempts(info)
  const recognitionImage = findImageInAttempts(recognitionAttempts)
  if (recognitionImage) return recognitionImage

  const nodeFlowImage = findImageInFlowItems(buildNodeFlowItems(info))
  if (nodeFlowImage) return nodeFlowImage

  return undefined
}
