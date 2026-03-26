<script setup lang="ts">
import {
  NCard,
  NText,
  NScrollbar,
  NEmpty,
  NSpin,
  NList,
  NListItem,
  NTag,
  NFlex,
} from 'naive-ui'

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
        {{ props.mobileMode ? `${props.totalMatches} 个结果` : `找到 ${props.totalMatches} 个结果` }}
      </n-text>
    </template>

    <n-scrollbar :style="{ height: '100%', paddingRight: props.mobileMode ? '4px' : '8px' }">
      <n-empty v-if="!props.fileName" description="请先加载文件" />
      <n-empty v-else-if="props.isLoadingFile" description="文件加载中...">
        <template #icon><n-spin size="large" /></template>
      </n-empty>
      <n-empty v-else-if="!props.searchText" :description="props.mobileMode ? '请输入搜索内容' : '请输入搜索内容并点击搜索'" />
      <n-empty v-else-if="props.isSearching" description="搜索中...">
        <template #icon><n-spin size="large" /></template>
      </n-empty>
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
            <n-text style="font-family: monospace; font-size: 12px; line-height: 1.5; word-break: break-all; flex: 1">
              <span>{{ props.highlightMatch(result).before }}</span>
              <span style="background-color: #f2c97d; color: #000; padding: 1px 3px; border-radius: 2px; font-weight: 600">
                {{ props.highlightMatch(result).match }}
              </span>
              <span>{{ props.highlightMatch(result).after }}</span>
            </n-text>
          </n-flex>
          <n-text v-else style="font-family: monospace; font-size: 12px; line-height: 1.6; word-break: break-all">
            <span>{{ props.highlightMatch(result).before }}</span>
            <span style="background-color: #f2c97d; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: 600">
              {{ props.highlightMatch(result).match }}
            </span>
            <span>{{ props.highlightMatch(result).after }}</span>
          </n-text>
        </n-list-item>
      </n-list>
    </n-scrollbar>
  </n-card>
</template>
