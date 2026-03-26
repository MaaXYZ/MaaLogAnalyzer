import type { TourRect, TourStepLike } from './types'

export const waitForElement = async (
  selector: string,
  timeoutMs: number,
): Promise<HTMLElement | null> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const found = document.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  return null
}

export const updateTourRectFromElement = (
  el: HTMLElement,
  step: TourStepLike | null,
): TourRect => {
  const rect = el.getBoundingClientRect()
  const padding = step?.padding ?? 8
  const top = Math.max(4, rect.top - padding)
  const left = Math.max(4, rect.left - padding)
  const width = Math.max(24, rect.width + padding * 2)
  const height = Math.max(24, rect.height + padding * 2)
  return { top, left, width, height }
}

export const getTourTargetSelector = (
  step: TourStepLike,
  isMobile: boolean,
) => {
  return isMobile && step.mobileTarget ? step.mobileTarget : step.target
}
