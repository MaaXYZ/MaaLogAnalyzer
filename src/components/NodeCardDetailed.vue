<script setup lang="ts">
import { NCard, NButton, NFlex, NTag, NImage } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem } from '../types'
import { isTauri } from '../utils/platform'

const convertFileSrc = (filePath: string) => {
  if (!isTauri()) return filePath
  return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
}

defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded: boolean
  actionExpanded: boolean
  isExpanded: (attemptIndex: number) => boolean
  getButtonType: (status: string) => 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
  actionButtonType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
}>()
</script>

<template>
  <!-- Recognition 部分 -->
  <n-card v-if="mergedRecognitionList.length > 0" size="small">
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
        <!-- 未识别的节点 -->
        <n-button
          v-if="recognitionExpanded && item.status === 'not-recognized'"
          size="small"
          type="default"
          ghost
          disabled
          style="align-self: flex-start; opacity: 0.5"
        >
          {{ item.name }}
        </n-button>

        <!-- 已识别的节点（没有嵌套节点） -->
        <n-flex v-else-if="!item.hasNestedNodes && (recognitionExpanded || item.status === 'success')" :key="`simple-${idx}`" vertical style="gap: 8px; align-items: flex-start">
          <n-button
            size="small"
            :type="getButtonType(item.status)"
            ghost
            @click="emit('select-recognition', node, item.attemptIndex!)"
          >
            <template #icon>
              <check-circle-outlined v-if="item.status === 'success'" />
              <close-circle-outlined v-else />
            </template>
            {{ item.name }}
          </n-button>
          <n-image
            v-if="item.attempt?.error_image"
            :src="convertFileSrc(item.attempt.error_image)"
            width="200"
            style="border-radius: 4px"
          />
        </n-flex>

        <!-- 已识别的节点（有嵌套节点） -->
        <template v-else-if="recognitionExpanded || item.status === 'success'">
          <!-- 展开状态 -->
          <n-card v-if="isExpanded(item.attemptIndex!)" :key="`nested-card-${item.attemptIndex}`" size="small">
            <template #header>
              <n-flex align="center" style="gap: 8px">
                <n-button
                  size="small"
                  :type="getButtonType(item.status)"
                  ghost
                  @click="emit('select-recognition', node, item.attemptIndex!)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="item.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ item.name }}
                </n-button>
                <n-button size="small" @click="emit('toggle-nested', item.attemptIndex!)">
                  Hide
                </n-button>
              </n-flex>
            </template>

            <n-flex vertical style="gap: 12px">
              <n-image
                v-if="item.attempt?.error_image"
                :src="convertFileSrc(item.attempt.error_image)"
                width="200"
                style="border-radius: 4px"
              />
              <n-flex wrap style="gap: 8px 12px">
                <n-button
                  v-for="(nested, nestedIdx) in item.attempt!.nested_nodes"
                  :key="`nested-${item.attemptIndex}-${nestedIdx}`"
                  size="small"
                  :type="nested.status === 'success' ? 'success' : 'warning'"
                  ghost
                  @click="emit('select-nested', node, item.attemptIndex!, nestedIdx)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="nested.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ nested.name }}
                </n-button>
              </n-flex>
            </n-flex>
          </n-card>

          <!-- 折叠状态 -->
          <n-flex v-else :key="`collapsed-${idx}`" vertical style="gap: 8px; align-items: flex-start">
            <n-flex align="center" style="gap: 8px">
              <n-button
                size="small"
                :type="getButtonType(item.status)"
                ghost
                @click="emit('select-recognition', node, item.attemptIndex!)"
              >
                <template #icon>
                  <check-circle-outlined v-if="item.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ item.name }}
              </n-button>
              <n-button size="small" @click="emit('toggle-nested', item.attemptIndex!)">
                Show
              </n-button>
            </n-flex>
            <n-image
              v-if="item.attempt?.error_image"
              :src="convertFileSrc(item.attempt.error_image)"
              width="200"
              style="border-radius: 4px"
            />
          </n-flex>
        </template>
      </template>
    </n-flex>
  </n-card>

  <!-- Action 部分 -->
  <n-card v-if="node.action_details || (node.nested_action_nodes && node.nested_action_nodes.length > 0)" size="small" title="Action">
    <n-flex vertical style="gap: 8px">
      <n-flex v-if="node.action_details" align="center" style="gap: 8px">
        <n-button
          size="small"
          :type="actionButtonType"
          ghost
          @click="emit('select-action', node)"
          style="align-self: flex-start"
        >
          <template #icon>
            <check-circle-outlined v-if="actionButtonType === 'success'" />
            <close-circle-outlined v-else />
          </template>
          {{ node.action_details.name }}
        </n-button>
        <n-button v-if="node.nested_action_nodes && node.nested_action_nodes.length > 0" size="small" @click="emit('toggle-action')">
          {{ actionExpanded ? 'Hide' : 'Show' }}
        </n-button>
      </n-flex>

      <template v-if="actionExpanded && node.nested_action_nodes && node.nested_action_nodes.length > 0">
        <template v-for="(nestedActionGroup, idx) in node.nested_action_nodes" :key="`nested-action-group-${idx}`">
          <n-flex vertical style="gap: 12px">
            <n-card
              v-for="(nested, nestedIdx) in nestedActionGroup.nested_actions"
              :key="`nested-action-${idx}-${nestedIdx}`"
              size="small"
            >
              <template #header>
                <n-flex justify="space-between" align="center">
                  <n-button
                    size="small"
                    @click="emit('select-nested-action', node, idx, nestedIdx)"
                  >
                    {{ nested.name }}
                  </n-button>
                  <n-tag size="small" :type="nested.status === 'success' ? 'success' : 'error'">
                    {{ nested.status === 'success' ? '成功' : '失败' }}
                  </n-tag>
                </n-flex>
              </template>

              <n-flex vertical style="gap: 8px">
                <n-card v-if="nested.recognition_attempts && nested.recognition_attempts.length > 0" size="small" title="Recognition">
                  <n-flex wrap style="gap: 8px">
                    <n-button
                      v-for="(attempt, attemptIdx) in nested.recognition_attempts"
                      :key="`nested-reco-${idx}-${nestedIdx}-${attemptIdx}`"
                      size="small"
                      :type="attempt.status === 'success' ? 'success' : 'warning'"
                      ghost
                    >
                      <template #icon>
                        <check-circle-outlined v-if="attempt.status === 'success'" />
                        <close-circle-outlined v-else />
                      </template>
                      {{ attempt.name }}
                    </n-button>
                  </n-flex>
                </n-card>

                <n-card v-if="nested.action_details" size="small" title="Action">
                  <n-button
                    size="small"
                    :type="nested.action_details.success ? 'success' : 'error'"
                    ghost
                    @click="emit('select-nested-action', node, idx, nestedIdx)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="nested.action_details.success" />
                      <close-circle-outlined v-else />
                    </template>
                    {{ nested.action_details.name }}
                  </n-button>
                </n-card>
              </n-flex>
            </n-card>
          </n-flex>
        </template>
      </template>
    </n-flex>
  </n-card>
</template>
