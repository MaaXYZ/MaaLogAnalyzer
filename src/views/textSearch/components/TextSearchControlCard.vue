<script setup lang="ts">
import {
  NCard,
  NFlex,
  NInputGroup,
  NInput,
  NButton,
  NCollapse,
  NCollapseItem,
  NCheckbox,
  NText,
  NTag,
} from 'naive-ui'
import { SearchOutlined } from '@vicons/antd'

const props = defineProps<{
  mobileMode: boolean
  searchText: string
  isSearching: boolean
  isLoadingFile: boolean
  hasFile: boolean
  caseSensitive: boolean
  useRegex: boolean
  hideDebugInfo: boolean
  quickSearchOptions: string[]
  searchHistory: string[]
  searchOptionExpandedNames: Array<string | number>
}>()

const emit = defineEmits<{
  'update:searchText': [value: string]
  'update:caseSensitive': [value: boolean]
  'update:useRegex': [value: boolean]
  'update:hideDebugInfo': [value: boolean]
  'update:searchOptionExpandedNames': [value: Array<string | number>]
  search: []
  quickSearch: [value: string]
  removeHistory: [value: string]
  useHistory: [value: string]
}>()
</script>

<template>
  <n-card size="small">
    <n-flex vertical :style="{ gap: props.mobileMode ? '10px' : '12px' }">
      <n-input-group>
        <n-input
          :value="props.searchText"
          placeholder="输入搜索内容..."
          clearable
          @update:value="emit('update:searchText', $event)"
          @keyup.enter="emit('search')"
          :disabled="props.isSearching"
          :input-props="props.mobileMode ? { id: 'text-search-input-m', name: 'text-search-input-m' } : { id: 'text-search-input', name: 'text-search-input' }"
        >
          <template #prefix>
            <search-outlined />
          </template>
        </n-input>
        <n-button
          type="primary"
          @click="emit('search')"
          :loading="props.isSearching || props.isLoadingFile"
          :disabled="!props.searchText || !props.hasFile || props.isLoadingFile"
        >
          {{ props.mobileMode ? '搜索' : (props.isLoadingFile ? '加载中...' : '搜索') }}
        </n-button>
      </n-input-group>

      <template v-if="!props.mobileMode">
        <n-collapse
          :expanded-names="props.searchOptionExpandedNames"
          @update:expanded-names="emit('update:searchOptionExpandedNames', $event)"
        >
          <n-collapse-item title="搜索选项" name="search-options">
            <n-flex vertical style="gap: 10px">
              <n-flex align="center" style="gap: 12px; flex-wrap: wrap">
                <n-checkbox
                  :checked="props.caseSensitive"
                  @update:checked="emit('update:caseSensitive', $event)"
                >
                  区分大小写
                </n-checkbox>
                <n-checkbox
                  :checked="props.useRegex"
                  @update:checked="emit('update:useRegex', $event)"
                >
                  正则表达式
                </n-checkbox>
                <n-checkbox
                  :checked="props.hideDebugInfo"
                  @update:checked="emit('update:hideDebugInfo', $event)"
                >
                  隐藏调试标签
                </n-checkbox>
              </n-flex>

              <div>
                <n-text depth="3" style="font-size: 12px; margin-bottom: 6px; display: block">
                  快捷搜索：
                </n-text>
                <n-flex wrap style="gap: 6px">
                  <n-button
                    v-for="option in props.quickSearchOptions"
                    :key="option"
                    size="tiny"
                    secondary
                    @click="emit('quickSearch', option)"
                    :type="props.searchText === option ? 'primary' : 'default'"
                  >
                    {{ option }}
                  </n-button>
                </n-flex>
              </div>

              <div v-if="props.searchHistory.length > 0">
                <n-text depth="3" style="font-size: 12px; margin-bottom: 6px; display: block">
                  搜索历史：
                </n-text>
                <n-flex wrap style="gap: 6px">
                  <n-tag
                    v-for="(item, idx) in props.searchHistory.slice(0, 10)"
                    :key="idx"
                    size="small"
                    closable
                    @close="emit('removeHistory', item)"
                    @click="emit('useHistory', item)"
                    style="cursor: pointer"
                    :type="props.searchText === item ? 'primary' : 'default'"
                  >
                    {{ item.length > 30 ? item.substring(0, 30) + '...' : item }}
                  </n-tag>
                </n-flex>
              </div>
            </n-flex>
          </n-collapse-item>
        </n-collapse>
      </template>
    </n-flex>
  </n-card>
</template>
