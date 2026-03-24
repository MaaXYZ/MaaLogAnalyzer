<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NCard, NButton, NFlex, NImage, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem } from '../types'
import { isTauri } from '../utils/platform'
import { buildNodeActionRootItem } from '../utils/nodeFlow'
import { getFlowItemButtonType, getFlowItemShortLabel } from '../utils/flowLabels'
import { flattenFlowItems, flattenNestedRecognitionNodes } from '../utils/flowTree'

const convertFileSrc = (filePath: string) => {
  if (!isTauri()) return filePath
  return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
}

const emit = defineEmits<{
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
}>()

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded: boolean
  actionExpanded: boolean
  defaultCollapseNestedRecognition?: boolean
  defaultCollapseNestedActionNodes?: boolean
  isExpanded: (attemptIndex: number) => boolean
  getButtonType: (status: string) => 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
  actionButtonType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
}>()

const DETAIL_INDENT_PX = 14

const toDetailOffset = (depth: number): string => `${depth * DETAIL_INDENT_PX}px`

const expandedNestedRecognitionItems = ref<Map<string, boolean>>(new Map())

const isNestedRecognitionFlowItemExpanded = (flowItemId: string): boolean => {
  const value = expandedNestedRecognitionItems.value.get(flowItemId)
  if (value !== undefined) return value
  return !(props.defaultCollapseNestedRecognition ?? true)
}

const toggleNestedRecognitionFlowItemExpand = (flowItemId: string) => {
  expandedNestedRecognitionItems.value.set(flowItemId, !isNestedRecognitionFlowItemExpanded(flowItemId))
}

const expandedActionFlowItems = ref<Map<string, boolean>>(new Map())

const isActionFlowItemExpanded = (flowItemId: string): boolean => {
  const value = expandedActionFlowItems.value.get(flowItemId)
  if (value !== undefined) return value
  return !(props.defaultCollapseNestedActionNodes ?? true)
}

const toggleActionFlowItem = (flowItemId: string) => {
  expandedActionFlowItems.value.set(flowItemId, !isActionFlowItemExpanded(flowItemId))
}

watch(() => props.node.node_id, () => {
  expandedNestedRecognitionItems.value.clear()
  expandedActionFlowItems.value.clear()
}, { flush: 'sync' })

watch(() => props.defaultCollapseNestedRecognition, () => {
  expandedNestedRecognitionItems.value.clear()
}, { flush: 'sync' })

watch(() => props.defaultCollapseNestedActionNodes, () => {
  expandedActionFlowItems.value.clear()
}, { flush: 'sync' })

const actionRootItem = computed(() => buildNodeActionRootItem(props.node))
const actionFlowRows = computed(() => flattenFlowItems(actionRootItem.value?.children, isActionFlowItemExpanded, 1))

const hasRecognitionSection = computed(() => props.mergedRecognitionList.length > 0)
const hasActionSection = computed(() => !!actionRootItem.value || !!props.node.action_details)

const recognitionNodeShortLabel = getFlowItemShortLabel('recognition_node')
</script>

<template>
  <n-card v-if="hasRecognitionSection" size="small">
      <template #header>
        <n-flex align="center" style="gap: 8px">
          <span>Recognition</span>
          <n-button size="small" @click="emit('toggle-recognition')">
            {{ recognitionExpanded ? 'Hide' : 'Show' }}
          </n-button>
        </n-flex>
      </template>

      <n-flex vertical style="gap: 8px">
        <template v-for="(item, idx) in mergedRecognitionList" :key="`merged-${idx}`">
          <n-text
            v-if="item.isRoundSeparator && recognitionExpanded"
            depth="3"
            class="round-separator"
          >
            {{ item.name }}
          </n-text>

          <n-button
            v-else-if="recognitionExpanded && item.status === 'not-recognized'"
            size="small"
            type="default"
            ghost
            disabled
            style="align-self: flex-start; opacity: 0.5"
          >
            {{ item.name }}
          </n-button>

          <template v-else-if="recognitionExpanded || item.status === 'success' || item.status === 'running'">
            <n-flex align="center" style="gap: 8px; align-self: flex-start">
              <n-button
                size="small"
                :type="getButtonType(item.status)"
                ghost
                @click="emit('select-recognition', node, item.attemptIndex!)"
              >
                <template #icon>
                  <check-circle-outlined v-if="item.status === 'success'" />
                  <loading-outlined v-else-if="item.status === 'running'" />
                  <close-circle-outlined v-else />
                </template>
                {{ item.name }}
              </n-button>
              <n-button
                v-if="item.hasNestedNodes && item.attemptIndex != null"
                size="small"
                @click="emit('toggle-nested', item.attemptIndex)"
              >
                {{ isExpanded(item.attemptIndex) ? 'Hide' : 'Show' }}
              </n-button>
            </n-flex>

            <n-flex
              v-if="item.attempt?.vision_image || item.attempt?.error_image"
              vertical
              style="gap: 8px; align-self: flex-start"
            >
              <n-image
                v-if="item.attempt?.vision_image"
                :src="convertFileSrc(item.attempt.vision_image)"
                width="200"
                style="border-radius: 4px"
              />
              <n-image
                v-if="item.attempt?.error_image"
                :src="convertFileSrc(item.attempt.error_image)"
                width="200"
                style="border-radius: 4px"
              />
            </n-flex>

            <n-flex
              v-if="
                item.hasNestedNodes &&
                item.attemptIndex != null &&
                isExpanded(item.attemptIndex) &&
                item.attempt?.nested_nodes &&
                item.attempt.nested_nodes.length > 0
              "
              vertical
              style="gap: 8px"
            >
              <template
                v-for="nested in flattenNestedRecognitionNodes(
                  item.attempt.nested_nodes,
                  `node.recognition.${item.attemptIndex}`,
                  isNestedRecognitionFlowItemExpanded,
                  1
                )"
                :key="`nested-${item.attemptIndex}-${nested.flowItemId}`"
              >
                <n-flex
                  align="center"
                  style="gap: 8px"
                  :style="{ marginLeft: toDetailOffset(nested.depth) }"
                >
                  <n-button
                    size="small"
                    :type="nested.attempt.status === 'success' ? 'success' : nested.attempt.status === 'running' ? 'info' : 'warning'"
                    ghost
                    @click="emit('select-flow-item', node, nested.flowItemId)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="nested.attempt.status === 'success'" />
                      <loading-outlined v-else-if="nested.attempt.status === 'running'" />
                      <close-circle-outlined v-else />
                    </template>
                    [{{ recognitionNodeShortLabel }}] {{ nested.attempt.name }}
                  </n-button>
                  <n-button
                    v-if="nested.hasChildren"
                    size="small"
                    @click.stop="toggleNestedRecognitionFlowItemExpand(nested.flowItemId)"
                  >
                    {{ nested.expanded ? 'Hide' : 'Show' }}
                  </n-button>
                </n-flex>

                <n-flex
                  v-if="nested.attempt.vision_image || nested.attempt.error_image"
                  vertical
                  style="gap: 8px"
                  :style="{ marginLeft: `${nested.depth * DETAIL_INDENT_PX + 24}px` }"
                >
                  <n-image
                    v-if="nested.attempt.vision_image"
                    :src="convertFileSrc(nested.attempt.vision_image)"
                    width="180"
                    style="border-radius: 4px"
                  />
                  <n-image
                    v-if="nested.attempt.error_image"
                    :src="convertFileSrc(nested.attempt.error_image)"
                    width="180"
                    style="border-radius: 4px"
                  />
                </n-flex>
              </template>
            </n-flex>
          </template>
        </template>
      </n-flex>
    </n-card>

  <n-card v-if="hasActionSection" size="small">
    <template #header>
      <span>Action</span>
    </template>

    <n-flex vertical style="gap: 10px">
      <n-flex align="center" style="gap: 8px; align-self: flex-start">
        <n-button
          v-if="actionRootItem"
          size="small"
          :type="actionRootItem.status === 'success' ? 'success' : actionRootItem.status === 'running' ? 'warning' : 'error'"
          ghost
          @click="emit('select-flow-item', node, actionRootItem.id)"
        >
          <template #icon>
            <check-circle-outlined v-if="actionRootItem.status === 'success'" />
            <loading-outlined v-else-if="actionRootItem.status === 'running'" />
            <close-circle-outlined v-else />
          </template>
          {{ actionRootItem.name }}
        </n-button>

        <n-button
          v-else-if="node.action_details"
          size="small"
          :type="actionButtonType"
          ghost
          @click="emit('select-action', node)"
          >
            <template #icon>
              <check-circle-outlined v-if="actionButtonType === 'success'" />
              <loading-outlined v-else-if="actionButtonType === 'warning'" />
              <close-circle-outlined v-else />
            </template>
            {{ node.action_details.name }}
        </n-button>

        <n-button v-if="actionFlowRows.length > 0" size="small" @click="emit('toggle-action')">
          {{ actionExpanded ? 'Hide' : 'Show' }}
        </n-button>
      </n-flex>

      <n-flex v-if="actionExpanded && actionFlowRows.length > 0" vertical style="gap: 8px">
        <n-flex
          v-for="row in actionFlowRows"
          :key="`detailed-flow-${row.item.id}`"
          align="center"
          style="gap: 8px"
          :style="{ marginLeft: toDetailOffset(row.depth) }"
        >
          <n-button
            size="small"
            :type="getFlowItemButtonType(row.item)"
            ghost
            @click="emit('select-flow-item', node, row.item.id)"
          >
            <template #icon>
              <check-circle-outlined v-if="row.item.status === 'success'" />
              <loading-outlined v-else-if="row.item.status === 'running'" />
              <close-circle-outlined v-else />
            </template>
            [{{ getFlowItemShortLabel(row.item.type) }}] {{ row.item.name }}
          </n-button>
          <n-button
            v-if="row.hasChildren"
            size="small"
            @click.stop="toggleActionFlowItem(row.item.id)"
          >
            {{ row.expanded ? 'Hide' : 'Show' }}
          </n-button>
        </n-flex>
      </n-flex>

    </n-flex>
  </n-card>
</template>

<style scoped>
.round-separator {
  display: block;
  width: 100%;
  padding: 4px 0;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.5px;
}
</style>
