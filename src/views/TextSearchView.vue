<script setup lang="ts">
import { nextTick, onActivated, ref, toRef, watch } from 'vue'
import TextSearchTopToolbar from './textSearch/components/TextSearchTopToolbar.vue'
import TextSearchMainContent from './textSearch/components/TextSearchMainContent.vue'
import {
  useTextSearchViewActions,
  useTextSearchViewContext,
  type UseTextSearchViewModelOptions,
} from './textSearch/composables/viewModel'
import { injectTextSearchSharedViewModel } from './textSearch/composables/viewModel/sharedModel'
import type { LoadedSearchTarget } from './textSearch/composables/types'
import type { PendingTextSearchRequest } from './app/components/types'

// Props
const props = withDefaults(
  defineProps<{
    isDark?: boolean
    loadedTargets?: LoadedSearchTarget[]
    loadedDefaultTargetId?: string
    hasDeferredLoadedTargets?: boolean
    ensureLoadedTargets?: (() => Promise<void>) | undefined
    ensureTargetContentLoaded?: ((targetId: string) => Promise<void>) | undefined
    findTargetContainingLocate?: ((locate: string) => Promise<string | null>) | undefined
    pendingSearchRequest?: PendingTextSearchRequest | null
    onConsumePendingSearch?: () => void
  }>(),
  {
    isDark: true,
    loadedTargets: () => [],
    loadedDefaultTargetId: '',
    hasDeferredLoadedTargets: false,
    ensureLoadedTargets: undefined,
    ensureTargetContentLoaded: undefined,
    findTargetContainingLocate: undefined,
    pendingSearchRequest: null,
    onConsumePendingSearch: undefined,
  },
)

// 优先注入 app 根部创建的共享模型（独立页与分屏共用同一状态）；
// 无提供者时（独立使用）退回本地创建
const injected = injectTextSearchSharedViewModel()
const viewModelOptions: UseTextSearchViewModelOptions = {
  loadedTargets: toRef(props, 'loadedTargets'),
  loadedDefaultTargetId: toRef(props, 'loadedDefaultTargetId'),
  hasDeferredLoadedTargets: toRef(props, 'hasDeferredLoadedTargets'),
  ensureLoadedTargets: toRef(props, 'ensureLoadedTargets'),
  ensureTargetContentLoaded: props.ensureTargetContentLoaded,
  findTargetContainingLocate: props.findTargetContainingLocate,
}

const context = injected?.context ?? useTextSearchViewContext(viewModelOptions)
const actions = injected?.actions ?? useTextSearchViewActions(context, viewModelOptions)

const {
  isMobile,
  textSearchSplitSize,
  searchText,
  fileContent,
  fileName,
  fileSizeInMB,
  caseSensitive,
  useRegex,
  topToolbarRef,
  isSearching,
  isLoadingFile,
  selectedLine,
  searchOptionExpandedNames,
  mobileControlExpandedNames,
  showFileContent,
  contentKey,
  hideDebugInfo,
  isLargeFile,
  totalLines,
  contextLines,
  contextStartLine,
  searchResults,
  totalMatches,
  sourceMode,
  selectedLoadedTargetId,
  sourceModeOptions,
  loadedTargetOptions,
  selectSourceMode,
  selectLoadedTarget,
  beginManualFileSelection,
  quickSearchOptions,
  filterDebugInfo,
  searchHistory,
  contentPaneRef: sharedContentPaneRef,
  performSearch,
  handleFileUpload,
  clearContent,
  jumpToLine,
  fileLines,
  highlightMatch,
  useHistoryItem,
  removeFromHistory,
} = {
  ...context,
  ...actions,
}

// 内容面板引用是实例私有的：激活时同步到共享模型，供 jumpToLine 使用
const contentPaneRef = ref<{ scrollToLine: (lineNumber: number) => void } | null>(null)
watch(
  contentPaneRef,
  (value) => {
    if (value) sharedContentPaneRef.value = value
  },
  { flush: 'post' },
)
onActivated(() => {
  if (contentPaneRef.value) sharedContentPaneRef.value = contentPaneRef.value
})

void topToolbarRef

// 消费来自详情面板的“在原文中查看”请求：填入关键词 → 搜索 → 按时间戳定位到具体行
watch(
  () => props.pendingSearchRequest,
  async (request) => {
    if (!request?.keyword) return
    props.onConsumePendingSearch?.()

    // 确保延迟加载的目标已就绪，否则搜索会提示“请先选择已加载目标文件”
    if (props.hasDeferredLoadedTargets && props.ensureLoadedTargets) {
      await props.ensureLoadedTargets()
    }

    // 首次进入视图时，默认目标的延迟加载与应用是异步的，
    // 等源真正就绪再搜索，否则首跳会搜到空源上（第二次点击才成功的根因）
    for (let i = 0; i < 40; i++) {
      if ((props.loadedTargets?.length ?? 0) > 0 && selectedLoadedTargetId.value && fileName.value)
        break
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    // 节点所在的目标不一定是默认目标（如旧行在 maa.bak.log 分段里），
    // 按时间戳找到真正包含该行的目标并切换过去（探测过程瞬时加载、只保留命中者）
    if (request.locate && props.findTargetContainingLocate) {
      const owningTargetId = await props.findTargetContainingLocate(request.locate)
      if (owningTargetId && owningTargetId !== selectedLoadedTargetId.value) {
        selectLoadedTarget(owningTargetId)
        // 目标内容应用是异步的，等 fileName 就绪再搜索
        const owningTarget = (props.loadedTargets ?? []).find(
          (target) => target.id === owningTargetId,
        )
        for (let i = 0; i < 20; i++) {
          await nextTick()
          if (owningTarget && fileName.value === owningTarget.fileName) break
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
    }

    searchText.value = request.keyword
    await performSearch()

    if (request.locate) {
      const target = searchResults.value.find((result) => result.line.includes(request.locate!))
      if (target) {
        await jumpToLine(target.lineNumber)
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    style="height: 100%; display: flex; flex-direction: column"
    data-tour="textsearch-root"
    :class="{ 'dark-theme': props.isDark }"
  >
    <!-- 顶部工具栏 -->
    <text-search-top-toolbar
      ref="topToolbarRef"
      :is-mobile="isMobile"
      :is-loading-file="isLoadingFile"
      :file-name="fileName"
      :total-lines="totalLines"
      :file-size-in-m-b="fileSizeInMB"
      :is-large-file="isLargeFile"
      :source-mode="sourceMode"
      :source-mode-options="sourceModeOptions"
      :selected-loaded-target-id="selectedLoadedTargetId"
      :loaded-target-options="loadedTargetOptions"
      :case-sensitive="caseSensitive"
      :use-regex="useRegex"
      :hide-debug-info="hideDebugInfo"
      :quick-search-options="quickSearchOptions"
      :search-text="searchText"
      :search-history="searchHistory"
      :mobile-control-expanded-names="mobileControlExpandedNames"
      @file-upload="handleFileUpload"
      @begin-file-selection="beginManualFileSelection"
      @clear-content="clearContent"
      @update:source-mode="selectSourceMode"
      @update:selected-loaded-target-id="selectLoadedTarget"
      @update:case-sensitive="caseSensitive = $event"
      @update:use-regex="useRegex = $event"
      @update:hide-debug-info="hideDebugInfo = $event"
      @update:mobile-control-expanded-names="mobileControlExpandedNames = $event"
      @use-history-item="useHistoryItem"
      @remove-history-item="removeFromHistory"
    />

    <!-- 主内容区域 -->
    <text-search-main-content
      ref="contentPaneRef"
      :is-mobile="isMobile"
      :content-key="contentKey"
      :text-search-split-size="textSearchSplitSize"
      :search-text="searchText"
      :is-searching="isSearching"
      :is-loading-file="isLoadingFile"
      :file-name="fileName"
      :case-sensitive="caseSensitive"
      :use-regex="useRegex"
      :hide-debug-info="hideDebugInfo"
      :quick-search-options="quickSearchOptions"
      :search-history="searchHistory"
      :search-option-expanded-names="searchOptionExpandedNames"
      :search-results="searchResults"
      :total-matches="totalMatches"
      :highlight-match="highlightMatch"
      :is-dark="!!props.isDark"
      :is-large-file="isLargeFile"
      :file-content="fileContent"
      :show-file-content="showFileContent"
      :total-lines="totalLines"
      :file-size-in-m-b="fileSizeInMB"
      :context-lines="contextLines"
      :context-start-line="contextStartLine"
      :selected-line="selectedLine"
      :file-lines="fileLines"
      :filter-debug-info="filterDebugInfo"
      @update:text-search-split-size="textSearchSplitSize = $event"
      @update:search-text="searchText = $event"
      @update:case-sensitive="caseSensitive = $event"
      @update:use-regex="useRegex = $event"
      @update:hide-debug-info="hideDebugInfo = $event"
      @update:search-option-expanded-names="searchOptionExpandedNames = $event"
      @search="performSearch"
      @quick-search="useHistoryItem"
      @remove-history="removeFromHistory"
      @use-history="useHistoryItem"
      @select-line="jumpToLine"
      @update:show-file-content="showFileContent = $event"
      @update:selected-line="selectedLine = $event"
    />
  </div>
</template>

<style scoped>
/* Fix Naive UI scrollbar container background in light mode */
:deep(.n-scrollbar-container) {
  background-color: transparent !important;
}

:deep(.n-scrollbar-content) {
  background-color: transparent !important;
}

:deep(.n-card__content) {
  background-color: transparent !important;
}
</style>
