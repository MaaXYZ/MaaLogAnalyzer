<script setup lang="ts">
import { createAsyncView } from '../../../utils/asyncView'
import type { TextSearchViewForwardProps } from './types'

const TextSearchView = createAsyncView('文本搜索', () => import('../../TextSearchView.vue'))

defineProps<{
  active: boolean
  textSearchViewProps: TextSearchViewForwardProps
}>()
</script>

<template>
  <div v-if="active" data-tour="search-main" style="height: 100%">
    <text-search-view v-bind="textSearchViewProps" style="height: 100%" />
  </div>
</template>
