<script setup lang="ts">
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@vicons/antd'

defineProps<{
  status: string
}>()
</script>

<template>
  <check-circle-outlined v-if="status === 'success'" />
  <loading-outlined v-else-if="status === 'running'" />
  <close-circle-outlined v-else />
</template>
