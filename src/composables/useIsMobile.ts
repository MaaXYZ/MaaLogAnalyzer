import { ref } from 'vue'
import type { Ref } from 'vue'

const MOBILE_BREAKPOINT = '(max-width: 768px)'
const MOBILE_BREAKPOINT_WIDTH = 768
const LAYOUT_STABILIZE_DELAY_MS = 120

const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT)

const readViewportWidth = (): number | null => {
  const candidates = [
    window.visualViewport?.width,
    window.innerWidth,
    document.documentElement?.clientWidth,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const width = Math.max(0, ...candidates)
  return width > 0 ? width : null
}

const readStableMobileState = (): boolean | null => {
  if (document.visibilityState === 'hidden') return null
  const width = readViewportWidth()
  if (width == null) return null
  return width <= MOBILE_BREAKPOINT_WIDTH
}

const isMobile = ref(readStableMobileState() ?? mediaQuery.matches)
let pendingUpdate: ReturnType<typeof setTimeout> | null = null

const commitStableMobileState = () => {
  pendingUpdate = null
  const next = readStableMobileState()
  if (next == null) return
  isMobile.value = next
}

const scheduleStableMobileUpdate = () => {
  if (pendingUpdate) clearTimeout(pendingUpdate)
  pendingUpdate = setTimeout(commitStableMobileState, LAYOUT_STABILIZE_DELAY_MS)
}

mediaQuery.addEventListener('change', () => {
  scheduleStableMobileUpdate()
})

window.addEventListener('resize', scheduleStableMobileUpdate)
window.visualViewport?.addEventListener('resize', scheduleStableMobileUpdate)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleStableMobileUpdate()
})

export function useIsMobile(): { isMobile: Ref<boolean> } {
  return { isMobile }
}
