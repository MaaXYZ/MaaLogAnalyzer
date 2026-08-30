import { ref } from 'vue'

export interface PendingTextSearchRequest {
  keyword: string
  /** 可选的行内定位串（如节点完整时间戳），搜索命中后用于选中该行 */
  locate?: string
}

/**
 * 详情面板 → 文本搜索的跳转桥。
 * 请求置为非空后由文本搜索视图消费（搜索 + 定位），消费完回调清空，避免重复触发。
 */
export const useTextSearchBridge = () => {
  const pendingTextSearchRequest = ref<PendingTextSearchRequest | null>(null)

  const requestTextSearch = (keyword: string, locate?: string) => {
    pendingTextSearchRequest.value = { keyword, locate }
  }

  const consumeTextSearchRequest = () => {
    pendingTextSearchRequest.value = null
  }

  return {
    pendingTextSearchRequest,
    requestTextSearch,
    consumeTextSearchRequest,
  }
}
