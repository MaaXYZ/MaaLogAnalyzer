import { defineComponent, defineAsyncComponent, h } from 'vue'
import type { Component, PropType } from 'vue'
import AsyncViewFallback from '../components/AsyncViewFallback.vue'

/** 首次失败后等这么久再试：文件只是短暂不可达（网络抖动 / 缓存失效）时往往一次就好 */
const CHUNK_RETRY_DELAY_MS = 250

/**
 * 加载一个懒加载面板的 chunk，失败时重试一次。
 *
 * 为什么需要：面板是按需 `import()` 的独立文件。部署（或本地 `vite build`）之后，
 * 名称带 hash 的旧 chunk 会被删掉；此时仍然开着的页面切到没加载过的面板就会 404，
 * 表现为整块区域空白 —— 用户看不出是「加载失败」还是「这份日志没数据」。
 *
 * 第二次仍然失败就抛给 `errorComponent`，由兜底界面说明原因并提供重试/刷新。
 */
export const loadViewChunk = async <T>(loader: () => Promise<T>): Promise<T> => {
  try {
    return await loader()
  } catch (firstError) {
    console.error('[async-view] 面板 chunk 首次加载失败，重试一次：', firstError)
    await new Promise((resolve) => setTimeout(resolve, CHUNK_RETRY_DELAY_MS))
    try {
      return await loader()
    } catch (retryError) {
      // 把两次错误都留在控制台：排查「部署后旧页面白屏」时这是唯一线索
      console.error('[async-view] 面板 chunk 重试仍失败：', retryError)
      throw firstError
    }
  }
}

/**
 * 带兜底界面的懒加载面板。
 *
 * `defineAsyncComponent` 只给 `errorComponent` 传 `error/retry/fail/attempts`，
 * 面板名得自己包一层带上去，所以这里返回一个内联组件。
 */
export const createAsyncView = (label: string, loader: () => Promise<Component>) =>
  defineAsyncComponent({
    loader: () => loadViewChunk(loader),
    delay: 150,
    timeout: 20_000,
    errorComponent: defineComponent({
      props: {
        error: { type: Object as PropType<Error>, default: undefined },
        retry: { type: Function as PropType<() => void>, default: undefined },
      },
      setup(props) {
        console.error('[async-view] 面板加载失败，已显示兜底界面：', label, props.error)
        return () => h(AsyncViewFallback, { label, retry: props.retry })
      },
    }),
  })
