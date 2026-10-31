<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NCard, NText, NScrollbar, NEmpty, NSpin, NList, NListItem, NTag, NFlex } from 'naive-ui'

interface SearchResult {
  lineNumber: number
  line: string
  matchStart: number
  matchEnd: number
  context: string
}

const props = defineProps<{
  mobileMode: boolean
  fileName: string
  isLoadingFile: boolean
  searchText: string
  isSearching: boolean
  searchResults: SearchResult[]
  totalMatches: number
  highlightMatch: (result: SearchResult) => { before: string; match: string; after: string }
}>()

const emit = defineEmits<{
  selectLine: [lineNumber: number]
}>()

/**
 * 已真正提交过的关键词。
 *
 * 为什么不用新 prop：结果卡是深层子组件，看不到视图层的「搜索历史」；而「输入了关键词」和
 * 「跑过这次搜索」必须区分开——之前两者共用「未找到匹配结果」，用户敲完词没按回车就被告知
 * 没有匹配，会把「还没搜」误读成「日志里没有」。
 * isSearching 只在按回车 / 点「搜索」后才被置为 true，所以它的上升沿就是「这次关键词真的搜过」，
 * watch 用 flush:'sync' 是为了极快的搜索也能在同一个 tick 里记到。
 */
const lastSearchedText = ref('')
watch(
  () => props.isSearching,
  (searching) => {
    if (searching) lastSearchedText.value = props.searchText
  },
  { flush: 'sync' },
)
// 换文件会清空结果，旧关键词的「已搜索」标记必须一起失效，否则新文件一进来就说「未找到」。
watch(
  () => props.fileName,
  () => {
    lastSearchedText.value = ''
  },
)

const hasExecutedSearch = computed(() => {
  const current = props.searchText.trim()
  return current.length > 0 && current === lastSearchedText.value.trim()
})
</script>

<template>
  <n-card
    size="small"
    data-tour="textsearch-results"
    :title="props.mobileMode ? '搜索结果' : '📋 搜索结果'"
    style="flex: 1; min-height: 0"
    content-style="height: 100%; overflow: hidden"
  >
    <template #header-extra>
      <n-text v-if="props.totalMatches > 0" type="success" style="font-size: 13px">
        {{
          props.mobileMode ? `${props.totalMatches} 个结果` : `找到 ${props.totalMatches} 个结果`
        }}
      </n-text>
    </template>

    <n-scrollbar :style="{ height: '100%', paddingRight: props.mobileMode ? '4px' : '8px' }">
      <n-empty v-if="!props.fileName" description="请先加载文件" />
      <n-empty v-else-if="props.isLoadingFile" description="文件加载中...">
        <template #icon><n-spin size="large" /></template>
      </n-empty>
      <n-empty
        v-else-if="!props.searchText"
        :description="props.mobileMode ? '请输入搜索内容' : '请输入搜索内容并点击搜索'"
      />
      <n-empty v-else-if="props.isSearching" description="搜索中...">
        <template #icon><n-spin size="large" /></template>
      </n-empty>
      <!-- 「关键词还没提交」与「搜过了但 0 命中」是两种状态，文案不能共用 -->
      <n-empty
        v-else-if="!hasExecutedSearch"
        :description="props.mobileMode ? '点「搜索」开始搜索' : '按回车或点「搜索」开始搜索'"
      />
      <n-empty v-else-if="props.searchResults.length === 0" description="未找到匹配结果" />
      <n-list v-else hoverable clickable>
        <n-list-item
          v-for="(result, idx) in props.searchResults"
          :key="idx"
          @click="emit('selectLine', result.lineNumber)"
          :style="{ cursor: 'pointer', padding: props.mobileMode ? '6px 8px' : '8px 12px' }"
        >
          <n-flex v-if="props.mobileMode" align="center" style="gap: 6px">
            <n-tag size="small" :bordered="false">{{ result.lineNumber }}</n-tag>
            <n-text
              style="
                font-family: monospace;
                font-size: 12px;
                line-height: 1.5;
                word-break: break-all;
                flex: 1;
              "
            >
              <span>{{ props.highlightMatch(result).before }}</span>
              <span
                style="
                  background-color: #f2c97d;
                  color: #000;
                  padding: 1px 3px;
                  border-radius: 2px;
                  font-weight: 600;
                "
              >
                {{ props.highlightMatch(result).match }}
              </span>
              <span>{{ props.highlightMatch(result).after }}</span>
            </n-text>
          </n-flex>
          <n-text
            v-else
            style="font-family: monospace; font-size: 12px; line-height: 1.6; word-break: break-all"
          >
            <span>{{ props.highlightMatch(result).before }}</span>
            <span
              style="
                background-color: #f2c97d;
                color: #000;
                padding: 2px 4px;
                border-radius: 2px;
                font-weight: 600;
              "
            >
              {{ props.highlightMatch(result).match }}
            </span>
            <span>{{ props.highlightMatch(result).after }}</span>
          </n-text>
        </n-list-item>
      </n-list>
    </n-scrollbar>
  </n-card>
</template>
