import { inject, provide, type InjectionKey } from 'vue'
import { useTextSearchViewActions } from './useTextSearchViewActions'
import { useTextSearchViewContext } from './useTextSearchViewContext'
import type { UseTextSearchViewModelOptions } from './types'

export interface TextSearchSharedViewModel {
  context: ReturnType<typeof useTextSearchViewContext>
  actions: ReturnType<typeof useTextSearchViewActions>
}

const TextSearchSharedViewModelKey: InjectionKey<TextSearchSharedViewModel> = Symbol(
  'TextSearchSharedViewModel',
)

/**
 * 在 app 根部创建唯一一份文本搜索 view model 并 provide。
 * 独立文本搜索页与分屏内的文本搜索都 inject 这一份，
 * 查询词 / 结果 / 选中目标天然保持同步，也避免两份实例重复持有日志内容。
 */
export const provideTextSearchSharedViewModel = (
  options: UseTextSearchViewModelOptions,
): TextSearchSharedViewModel => {
  const context = useTextSearchViewContext(options)
  const actions = useTextSearchViewActions(context, options)
  const model: TextSearchSharedViewModel = { context, actions }
  provide(TextSearchSharedViewModelKey, model)
  return model
}

export const injectTextSearchSharedViewModel = (): TextSearchSharedViewModel | null =>
  inject(TextSearchSharedViewModelKey, null)
