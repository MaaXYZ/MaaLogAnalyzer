import { nextTick, type Ref } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'

interface RealtimeFollowScrollingOptions {
  virtualScroller: Ref<InstanceType<typeof DynamicScroller> | null>
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

  const getScrollerElement = () => {
    return (options.virtualScroller.value?.$el ?? null) as HTMLElement | null
  }

  // 动态高度 + 高频更新下，scrollToItem 可能在尺寸缓存未就绪时抛错（accumulator undefined）
  const safeScrollToItem = async (index: number, retry = 0): Promise<boolean> => {
    const scroller = options.virtualScroller.value
    const total = options.currentNodeCount.value
    if (!scroller || total === 0) return false

    const targetIndex = Math.max(0, Math.min(index, total - 1))
    await nextTick()

    try {
      scroller.scrollToItem(targetIndex)
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

    // 动态高度内容渲染后再补一次，减少偏移
    setTimeout(() => {
      void safeScrollToItem(index)
    }, 80)
  }

  const scrollNodeTimelineToBottom = () => {
    const scrollerEl = getScrollerElement()
    if (!scrollerEl) return
    const maxScrollTop = scrollerEl.scrollHeight - scrollerEl.clientHeight
    if (maxScrollTop <= 0) return
    // 已经贴底时不重复滚动，避免高频触发 overlay scrollbar（mac 下会很明显）
    if (Math.abs(maxScrollTop - scrollerEl.scrollTop) <= 1) return
    if (typeof scrollerEl.scrollTo === 'function') {
      scrollerEl.scrollTo({ top: maxScrollTop, behavior: 'auto' })
    } else {
      scrollerEl.scrollTop = maxScrollTop
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
