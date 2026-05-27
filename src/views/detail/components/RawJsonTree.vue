<script setup lang="ts">
import { computed, ref } from 'vue'
import { CopyOutlined } from '@vicons/antd'

const props = withDefaults(defineProps<{
  name?: string
  value: unknown
  depth?: number
  root?: boolean
  defaultExpandAll?: boolean
  formatJson: (obj: any) => string
  copyToClipboard: (text: string) => void
}>(), {
  name: '',
  depth: 0,
  root: false,
  defaultExpandAll: false,
})

const MAX_VISIBLE_ENTRIES = 200

const expanded = ref(props.root || props.defaultExpandAll)

const isRecordLike = computed(() => props.value !== null && typeof props.value === 'object')
const isArrayValue = computed(() => Array.isArray(props.value))

const entries = computed(() => {
  if (!isRecordLike.value) return []
  const value = props.value as Record<string, unknown> | unknown[]
  const rawEntries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value)
  return rawEntries.slice(0, MAX_VISIBLE_ENTRIES)
})

const hiddenEntryCount = computed(() => {
  if (!isRecordLike.value) return 0
  const value = props.value as Record<string, unknown> | unknown[]
  const count = Array.isArray(value) ? value.length : Object.keys(value).length
  return Math.max(0, count - MAX_VISIBLE_ENTRIES)
})

const valueSummary = computed(() => {
  const value = props.value
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value !== null && typeof value === 'object') return `Object(${Object.keys(value).length})`
  if (typeof value === 'string') return JSON.stringify(value.length > 180 ? `${value.slice(0, 180)}...` : value)
  if (typeof value === 'undefined') return 'undefined'
  return JSON.stringify(value)
})

const toggle = () => {
  if (isRecordLike.value) {
    expanded.value = !expanded.value
  }
}

const handleCopy = () => {
  props.copyToClipboard(props.formatJson(props.value))
}
</script>

<template>
  <div class="raw-json-tree-node" :class="{ root: props.root }">
    <div class="raw-json-tree-row">
      <button
        v-if="isRecordLike"
        class="raw-json-tree-toggle"
        type="button"
        @click="toggle"
      >
        {{ expanded ? '-' : '+' }}
      </button>
      <span v-else class="raw-json-tree-spacer" />

      <span v-if="props.name" class="raw-json-tree-key">{{ props.name }}</span>
      <span v-if="props.name" class="raw-json-tree-colon">:</span>
      <span
        class="raw-json-tree-summary"
        :class="{ primitive: !isRecordLike, array: isArrayValue }"
      >
        {{ valueSummary }}
      </span>
      <button
        class="raw-json-tree-copy"
        type="button"
        title="复制当前值"
        @click.stop="handleCopy"
      >
        <copy-outlined />
      </button>
    </div>

    <div v-if="isRecordLike && expanded" class="raw-json-tree-children">
      <raw-json-tree
        v-for="[entryName, entryValue] in entries"
        :key="entryName"
        :name="entryName"
        :value="entryValue"
        :depth="props.depth + 1"
        :default-expand-all="props.defaultExpandAll"
        :format-json="props.formatJson"
        :copy-to-clipboard="props.copyToClipboard"
      />
      <div v-if="hiddenEntryCount > 0" class="raw-json-tree-more">
        ... {{ hiddenEntryCount }} more entries
      </div>
    </div>
  </div>
</template>

<style scoped>
.raw-json-tree-node {
  --raw-json-tree-key-color: #1d4ed8;
  --raw-json-tree-object-color: #6d28d9;
  --raw-json-tree-primitive-color: #047857;
  --raw-json-tree-array-color: #b45309;
  --raw-json-tree-muted-color: rgba(100, 116, 139, 0.95);
  --raw-json-tree-copy-color: rgba(100, 116, 139, 0.9);
  --raw-json-tree-toggle-bg: rgba(148, 163, 184, 0.16);
  --raw-json-tree-guide-color: rgba(148, 163, 184, 0.28);
  font-family: ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
}

:global(body.vscode-dark:not(.force-light)) .raw-json-tree-node,
:global(body.vscode-high-contrast:not(.force-light)) .raw-json-tree-node,
:global(body.force-dark) .raw-json-tree-node {
  --raw-json-tree-key-color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
  --raw-json-tree-object-color: #dcdcaa;
  --raw-json-tree-primitive-color: #b5cea8;
  --raw-json-tree-array-color: #ce9178;
  --raw-json-tree-muted-color: rgba(212, 212, 212, 0.82);
  --raw-json-tree-copy-color: rgba(212, 212, 212, 0.86);
  --raw-json-tree-toggle-bg: rgba(156, 220, 254, 0.16);
  --raw-json-tree-guide-color: rgba(156, 220, 254, 0.3);
}

@media (prefers-color-scheme: dark) {
  :global(body:not(.force-light):not(.vscode-light):not(.vscode-high-contrast-light)) .raw-json-tree-node {
    --raw-json-tree-key-color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    --raw-json-tree-object-color: #dcdcaa;
    --raw-json-tree-primitive-color: #b5cea8;
    --raw-json-tree-array-color: #ce9178;
    --raw-json-tree-muted-color: rgba(212, 212, 212, 0.82);
    --raw-json-tree-copy-color: rgba(212, 212, 212, 0.86);
    --raw-json-tree-toggle-bg: rgba(156, 220, 254, 0.16);
    --raw-json-tree-guide-color: rgba(156, 220, 254, 0.3);
  }
}

.raw-json-tree-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.raw-json-tree-row:hover .raw-json-tree-copy,
.raw-json-tree-copy:focus-visible {
  opacity: 1;
}

.raw-json-tree-toggle {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: var(--raw-json-tree-toggle-bg);
  color: inherit;
  cursor: pointer;
  line-height: 18px;
}

.raw-json-tree-spacer {
  width: 18px;
  flex: 0 0 18px;
}

.raw-json-tree-copy {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--raw-json-tree-copy-color);
  cursor: pointer;
  opacity: 0;
}

.raw-json-tree-copy:hover {
  background: var(--raw-json-tree-toggle-bg);
}

.raw-json-tree-key {
  color: var(--raw-json-tree-key-color);
  overflow-wrap: anywhere;
}

.raw-json-tree-colon {
  color: var(--raw-json-tree-muted-color);
}

.raw-json-tree-summary {
  color: var(--raw-json-tree-object-color);
  overflow-wrap: anywhere;
}

.raw-json-tree-summary.primitive {
  color: var(--raw-json-tree-primitive-color);
}

.raw-json-tree-summary.array {
  color: var(--raw-json-tree-array-color);
}

.raw-json-tree-children {
  margin-left: 18px;
  padding-left: 8px;
  border-left: 1px solid var(--raw-json-tree-guide-color);
}

.raw-json-tree-more {
  margin-left: 18px;
  color: var(--raw-json-tree-muted-color);
}
</style>
