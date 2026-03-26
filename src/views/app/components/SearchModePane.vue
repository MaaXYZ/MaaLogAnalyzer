<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { TextSearchViewForwardProps } from './types'

const TextSearchView = defineAsyncComponent(() => import('../../TextSearchView.vue'))

defineProps<{
  active: boolean
  textSearchViewProps: TextSearchViewForwardProps
}>()
</script>

<template>
  <div v-show="active" data-tour="search-main" style="height: 100%">
    <text-search-view
      v-bind="textSearchViewProps"
      style="height: 100%"
    />
  </div>
</template>
