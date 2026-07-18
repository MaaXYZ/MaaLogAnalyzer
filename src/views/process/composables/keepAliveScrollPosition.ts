import {
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  watch,
} from 'vue'

export interface ScrollPositionSnapshot {
  contextKey: string | null
  scrollTop: number
}

type ScrollPositionElement = Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>

export const captureScrollPosition = (
  scroller: ScrollPositionElement | null,
  contextKey: string | null,
): ScrollPositionSnapshot | null => {
  if (!scroller) return null
  return {
    contextKey,
    scrollTop: Number.isFinite(scroller.scrollTop) ? Math.max(0, scroller.scrollTop) : 0,
  }
}

export const restoreScrollPosition = (
  scroller: ScrollPositionElement | null,
  snapshot: ScrollPositionSnapshot | null,
  contextKey: string | null,
): boolean => {
  if (!scroller || !snapshot || snapshot.contextKey !== contextKey) return false

  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  scroller.scrollTop = Math.min(snapshot.scrollTop, maxScrollTop)
  return true
}

export const createScrollPositionMemory = () => {
  let snapshot: ScrollPositionSnapshot | null = null

  return {
    capture: (scroller: ScrollPositionElement | null, contextKey: string | null) => {
      snapshot = captureScrollPosition(scroller, contextKey)
      return snapshot
    },
    restore: (scroller: ScrollPositionElement | null, contextKey: string | null) => (
      restoreScrollPosition(scroller, snapshot, contextKey)
    ),
    clear: () => {
      snapshot = null
    },
    hasSnapshot: () => snapshot !== null,
  }
}

interface KeepAliveScrollPositionOptions {
  getScrollerElement: () => HTMLElement | null
  getContextKey: () => string | null
  shouldPreserve: () => boolean
}

export const useKeepAliveScrollPosition = (options: KeepAliveScrollPositionOptions) => {
  const memory = createScrollPositionMemory()
  let restoreFrameId: number | null = null
  let isActive = true
  let isRestoring = false

  const clearRestoreFrame = () => {
    if (restoreFrameId == null || typeof window === 'undefined') return
    window.cancelAnimationFrame(restoreFrameId)
    restoreFrameId = null
  }

  const cancelScrollRestore = () => {
    clearRestoreFrame()
    isRestoring = false
  }

  const discardScrollPosition = () => {
    cancelScrollRestore()
    memory.clear()
  }

  const captureCurrentScrollPosition = (event?: Event) => {
    if (!isActive || isRestoring || !options.shouldPreserve()) return

    const eventTarget = typeof HTMLElement !== 'undefined' && event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : null
    const scroller = eventTarget ?? options.getScrollerElement()
    if (!scroller?.isConnected) return

    memory.capture(scroller, options.getContextKey())
  }

  const applySavedScrollPosition = () => {
    if (!isActive || !options.shouldPreserve()) return false
    return memory.restore(options.getScrollerElement(), options.getContextKey())
  }

  const finishRestore = () => {
    isRestoring = false
    captureCurrentScrollPosition()
  }

  const scheduleScrollRestore = async () => {
    if (!memory.hasSnapshot() || !options.shouldPreserve()) return
    isRestoring = true
    await nextTick()
    if (!isActive || !options.shouldPreserve()) {
      isRestoring = false
      return
    }

    applySavedScrollPosition()
    if (typeof window === 'undefined') {
      finishRestore()
      return
    }

    restoreFrameId = window.requestAnimationFrame(() => {
      restoreFrameId = null
      applySavedScrollPosition()
      if (!isActive || !options.shouldPreserve()) {
        isRestoring = false
        return
      }

      restoreFrameId = window.requestAnimationFrame(() => {
        restoreFrameId = null
        applySavedScrollPosition()
        finishRestore()
      })
    })
  }

  watch(options.getContextKey, (contextKey, previousContextKey) => {
    if (contextKey !== previousContextKey) discardScrollPosition()
  }, { flush: 'sync' })

  watch(options.shouldPreserve, (preserve) => {
    if (!preserve) {
      discardScrollPosition()
      return
    }
    void nextTick(() => captureCurrentScrollPosition())
  }, { flush: 'sync' })

  onMounted(() => {
    void nextTick(() => captureCurrentScrollPosition())
  })

  onDeactivated(() => {
    isActive = false
    cancelScrollRestore()
  })

  onActivated(() => {
    isActive = true
    if (!options.shouldPreserve()) {
      discardScrollPosition()
      return
    }
    void scheduleScrollRestore()
  })

  onBeforeUnmount(() => {
    isActive = false
    cancelScrollRestore()
  })

  return {
    captureCurrentScrollPosition,
    cancelScrollRestore,
    discardScrollPosition,
  }
}
