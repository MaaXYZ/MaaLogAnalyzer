<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { NModal } from 'naive-ui'

const SettingsView = defineAsyncComponent(() => import('../../../../views/SettingsView.vue'))

defineProps<{
  show: boolean
  width: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const handleShowUpdate = (value: boolean) => {
  emit('update:show', value)
}
</script>

<template>
  <n-modal
    :show="show"
    @update:show="handleShowUpdate"
    preset="card"
    title="设置"
    :style="{ width }"
    :bordered="false"
  >
    <settings-view />
  </n-modal>
</template>
