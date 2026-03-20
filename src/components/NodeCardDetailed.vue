<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NButton, NFlex, NTag, NImage } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem, NestedActionNode, RecognitionAttempt } from '../types'
import { isTauri } from '../utils/platform'

const convertFileSrc = (filePath: string) => {
  if (!isTauri()) return filePath
  return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
}

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
  'select-action-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested-action-recognition': [node: NodeInfo, actionIndex: number, nestedIndex: number, attemptIndex: number]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
}>()

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded: boolean
  actionExpanded: boolean
  isExpanded: (attemptIndex: number) => boolean
  getButtonType: (status: string) => 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
  actionButtonType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
}>()

const dedupeRecognitionAttempts = (items: RecognitionAttempt[]) => {
  const seen = new Set<string>()
  const result: RecognitionAttempt[] = []
  for (const item of items) {
    const key = `${item.reco_id}|${item.name}|${item.timestamp}|${item.status}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

const actionTree = computed(() => {
  const actions: Array<{
    groupIdx: number
    nestedIdx: number
    nested: NestedActionNode
    recognitionItems: RecognitionAttempt[]
  }> = []

  if (props.node.nested_action_nodes) {
    for (let gi = 0; gi < props.node.nested_action_nodes.length; gi++) {
      const group = props.node.nested_action_nodes[gi]
      for (let ni = 0; ni < group.nested_actions.length; ni++) {
        const nested = group.nested_actions[ni]
        actions.push({
          groupIdx: gi,
          nestedIdx: ni,
          nested,
          recognitionItems: [...(nested.recognition_attempts ?? [])]
        })
      }
    }
  }

  for (const action of actions) {
    action.recognitionItems = dedupeRecognitionAttempts(action.recognitionItems)
  }

  return {
    actions,
    actionLevelReco: dedupeRecognitionAttempts(props.node.nested_recognition_in_action ?? []),
  }
})
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
        <!-- 轮次分隔 -->
        <n-text
          v-if="item.isRoundSeparator && recognitionExpanded"
          depth="3"
          class="round-separator"
        >
          {{ item.name }}
        </n-text>

        <!-- 未识别的节点 -->
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
        </template>
      </template>
    </n-flex>
  </n-card>

  <!-- Action 部分 -->
  <n-card
    v-if="
      node.action_details ||
      actionTree.actions.length > 0 ||
      actionTree.actionLevelReco.length > 0
    "
    size="small"
    title="Action"
  >
    <n-flex vertical style="gap: 8px">
      <n-flex align="center" style="gap: 8px">
        <n-button
          v-if="node.action_details"
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
        <n-tag v-else size="small" type="default">No main action detail</n-tag>
        <n-button
          v-if="actionTree.actions.length > 0 || actionTree.actionLevelReco.length > 0"
          size="small"
          @click="emit('toggle-action')"
        >
          {{ actionExpanded ? 'Hide' : 'Show' }}
        </n-button>
      </n-flex>

      <template
        v-if="actionExpanded && (actionTree.actions.length > 0 || actionTree.actionLevelReco.length > 0)"
      >
        <n-flex vertical style="gap: 12px">
          <n-card
            v-if="actionTree.actionLevelReco.length > 0"
            size="small"
            title="Action 内识别"
          >
            <n-flex wrap style="gap: 8px">
              <n-button
                v-for="(attempt, attemptIdx) in actionTree.actionLevelReco"
                :key="`action-level-reco-${attemptIdx}`"
                size="small"
                :type="attempt.status === 'success' ? 'success' : 'warning'"
                ghost
                @click="emit('select-action-recognition', node, attemptIdx)"
              >
                <template #icon>
                  <check-circle-outlined v-if="attempt.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ attempt.name }}
              </n-button>
            </n-flex>
          </n-card>

          <n-card
            v-for="(item, idx) in actionTree.actions"
            :key="`nested-action-${idx}`"
            size="small"
          >
            <template #header>
              <n-flex justify="space-between" align="center">
                <n-button
                  size="small"
                  @click="emit('select-nested-action', node, item.groupIdx, item.nestedIdx)"
                >
                  {{ item.nested.name }}{{ item.recognitionItems.length ? ` (${item.recognitionItems.length})` : '' }}
                </n-button>
                <n-tag size="small" :type="item.nested.status === 'success' ? 'success' : 'error'">
                  {{ item.nested.status === 'success' ? '成功' : '失败' }}
                </n-tag>
              </n-flex>
            </template>

            <n-flex vertical style="gap: 8px">
              <n-card v-if="item.recognitionItems.length > 0" size="small" title="Recognition">
                <n-flex wrap style="gap: 8px">
                  <n-button
                    v-for="(attempt, attemptIdx) in item.recognitionItems"
                    :key="`nested-reco-${idx}-${attemptIdx}`"
                    size="small"
                    :type="attempt.status === 'success' ? 'success' : 'warning'"
                    ghost
                    @click="emit('select-nested-action-recognition', node, item.groupIdx, item.nestedIdx, attemptIdx)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="attempt.status === 'success'" />
                      <close-circle-outlined v-else />
                    </template>
                    {{ attempt.name }}
                  </n-button>
                </n-flex>
              </n-card>

              <n-card size="small" title="Action">
                <n-button
                  v-if="item.nested.action_details"
                  size="small"
                  :type="item.nested.action_details.success ? 'success' : 'error'"
                  ghost
                  @click="emit('select-nested-action', node, item.groupIdx, item.nestedIdx)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="item.nested.action_details.success" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ item.nested.action_details.name }}
                </n-button>
                <n-flex v-else align="center" style="gap: 8px">
                  <n-tag size="small" type="default">No action detail</n-tag>
                  <n-button
                    size="tiny"
                    ghost
                    @click="emit('select-nested-action', node, item.groupIdx, item.nestedIdx)"
                  >
                    查看节点
                  </n-button>
                </n-flex>
              </n-card>
            </n-flex>
          </n-card>
        </n-flex>
      </template>
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
