import { nextTick, type Ref } from 'vue'
import type { DynamicScrollerInstance } from '../../../../types/virtualScroller'

interface RealtimeFollowScrollingOptions {
  virtualScroller: Ref<DynamicScrollerInstance | null>
  currentNodeCount: Ref<number>
  isRealtimeStreaming: Ref<boolean>
  followLast: Ref<boolean>
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const createRealtimeFollowScrolling = (
  options: RealtimeFollowScrollingOptions,
) => {
  let lastAlignedLatestIndex = -1
  let lastScrollerElement: HTMLElement | null = null

  const isHtmlElement = (value: unknown): value is HTMLElement => {
    return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
  }

  const canScrollToItem = (value: unknown): value is { scrollToItem: (index: number) => void } => {
    return typeof (value as { scrollToItem?: unknown } | null)?.scrollToItem === 'function'
  }

  const getScrollerElement = () => {
    const scrollerRef = options.virtualScroller.value as unknown
    if (!scrollerRef) return null

    const rootCandidate = (scrollerRef as { $el?: unknown }).$el ?? scrollerRef
    if (!isHtmlElement(rootCandidate)) return null

    const nested = rootCandidate.querySelector('.vue-recycle-scroller') as HTMLElement | null
    return nested ?? rootCandidate
  }

  const findRenderedItemElement = (index: number): HTMLElement | null => {
    const scrollerEl = getScrollerElement()
    if (!scrollerEl) return null
    return scrollerEl.querySelector(`[data-index="${index}"]`) as HTMLElement | null
  }

  const alignToRenderedItem = async (index: number, retry = 0): Promise<boolean> => {
    const itemEl = findRenderedItemElement(index)
    if (itemEl) {
      itemEl.scrollIntoView({ block: 'center', behavior: 'auto' })
      return true
    }

    if (retry >= 4) return false

    await delay(50 * (retry + 1))
    const ok = await safeScrollToItem(index)
    if (!ok) return false
    await nextTick()
    return alignToRenderedItem(index, retry + 1)
  }

  // 动态高度 + 高频更新下，scrollToItem 可能在尺寸缓存未就绪时抛错（accumulator undefined）
  const safeScrollToItem = async (index: number, retry = 0): Promise<boolean> => {
    const scroller = options.virtualScroller.value as unknown
    const total = options.currentNodeCount.value
    if (!scroller || total === 0) return false

    const targetIndex = Math.max(0, Math.min(index, total - 1))
    await nextTick()

    try {
      if (canScrollToItem(scroller)) {
        scroller.scrollToItem(targetIndex)
      } else {
        // 某些运行环境 ref 可能是 DOM 节点而非组件实例；保底至少支持“滚到底”。
        const scrollerEl = getScrollerElement()
        if (!scrollerEl) return false
        if (targetIndex < total - 1) return false
        
        let paddingHeight = 0
        const paddingEl = scrollerEl.querySelector('.virtual-scroller-overscroll-padding') as HTMLElement | null
        if (paddingEl) paddingHeight = paddingEl.offsetHeight
        
        const targetScrollTop = Math.max(0, scrollerEl.scrollHeight - paddingHeight - scrollerEl.clientHeight)
        scrollerEl.scrollTo({ top: targetScrollTop, behavior: 'auto' })
      }
      return true
    } catch (error) {
      if (retry >= 2) {
        console.debug('[follow] scrollToItem skipped:', error)
        return false
      }
      await delay(60 * (retry + 1))
      return safeScrollToItem(targetIndex, retry + 1)
    }
  }

  const scrollToNode = async (index: number) => {
    const ok = await safeScrollToItem(index)
    if (!ok) return

    await nextTick()
    await alignToRenderedItem(index)

    // 动态高度内容渲染后再补一次，减少初次加载时的偏移
    setTimeout(() => {
      void safeScrollToItem(index)
      void alignToRenderedItem(index)
    }, 80)
  }

  const scrollNodeTimelineToBottom = () => {
    const scrollerEl = getScrollerElement()
    if (!scrollerEl) return
    
    let paddingHeight = 0
    const paddingEl = scrollerEl.querySelector('.virtual-scroller-overscroll-padding') as HTMLElement | null
    if (paddingEl) paddingHeight = paddingEl.offsetHeight
    
    let targetScrollTop = scrollerEl.scrollHeight - paddingHeight - scrollerEl.clientHeight
    if (targetScrollTop < 0) targetScrollTop = 0
    
    // 已经贴底时不重复滚动，避免高频触发 overlay scrollbar（mac 下会很明显）
    if (Math.abs(targetScrollTop - scrollerEl.scrollTop) <= 1) return
    if (typeof scrollerEl.scrollTo === 'function') {
      scrollerEl.scrollTo({ top: targetScrollTop, behavior: 'auto' })
    } else {
      scrollerEl.scrollTop = targetScrollTop
    }
  }

  const scrollToLatestNodeBottom = async () => {
    const latestNodeIndex = options.currentNodeCount.value - 1
    if (latestNodeIndex < 0) return

    const scrollerEl = getScrollerElement()
    if (scrollerEl !== lastScrollerElement) {
      lastScrollerElement = scrollerEl
      lastAlignedLatestIndex = -1
    }

    // 只有索引变化（新节点）时才对齐到 item，避免同一节点状态更新导致重复 scrollToItem
    if (latestNodeIndex !== lastAlignedLatestIndex) {
      await safeScrollToItem(latestNodeIndex)
      lastAlignedLatestIndex = latestNodeIndex
    }

    await nextTick()
    scrollNodeTimelineToBottom()

    // 动态高度在下一帧更新时再补一次，保证展开子节点时仍贴底
    setTimeout(() => {
      if (!options.isRealtimeStreaming.value || !options.followLast.value) return
      scrollNodeTimelineToBottom()
    }, 80)
  }

  return {
    safeScrollToItem,
    scrollToNode,
    scrollToLatestNodeBottom,
  }
}
