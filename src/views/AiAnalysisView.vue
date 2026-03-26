<script setup lang="ts">
import {
  useAiAnalysisViewModel,
} from './aiAnalysis/composables/useAiAnalysisViewModel'
import type { AiAnalysisViewModelProps } from './aiAnalysis/viewModelTypes'
import AiInputPanel from './aiAnalysis/components/AiInputPanel.vue'
import AiMemoryModal from './aiAnalysis/components/AiMemoryModal.vue'
import AiOutputPanel from './aiAnalysis/components/AiOutputPanel.vue'
const props = defineProps<AiAnalysisViewModelProps>()

const {
  inputPanelProps,
  inputPanelHandlers,
  outputPanelProps,
  outputPanelHandlers,
  memoryDialogVisible,
  currentMemoryFull,
} = useAiAnalysisViewModel(props)
</script>

<template>
  <div class="ai-view-root">
    <div class="ai-view-grid">
      <AiInputPanel v-bind="inputPanelProps" v-on="inputPanelHandlers" />

      <AiOutputPanel v-bind="outputPanelProps" v-on="outputPanelHandlers" />
    </div>

    <AiMemoryModal
      v-model:show="memoryDialogVisible"
      :content="currentMemoryFull"
    />
  </div>
</template>

<style scoped>
.ai-view-root {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 8px;
  box-sizing: border-box;
}

.ai-view-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(360px, 460px) minmax(0, 1fr);
}

.ai-view-grid > * {
  min-height: 0;
  min-width: 0;
}

@media (max-width: 900px) {
  .ai-view-root {
    overflow: auto;
  }

  .ai-view-grid {
    height: auto;
    min-height: 100%;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 6px;
  }

}
</style>
