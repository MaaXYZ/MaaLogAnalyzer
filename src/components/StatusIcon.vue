<script setup lang="ts">
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@vicons/antd'
import type { MergedRecognitionItem, NodeInfo, UnifiedFlowItem } from '../types'

type StatusIconState =
  NodeInfo['status'] | UnifiedFlowItem['status'] | MergedRecognitionItem['status']

defineProps<{
  status: StatusIconState
}>()
</script>

<template>
  <check-circle-outlined v-if="status === 'success'" />
  <loading-outlined v-else-if="status === 'running'" />
  <close-circle-outlined v-else />
</template>
