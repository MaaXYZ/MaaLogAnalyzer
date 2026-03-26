import { computed, type Ref } from 'vue'
import type { StatMode } from './useNodeStatisticsMetrics'
import { buildNodeColumns } from './tableColumns/nodeColumnsBuilder'
import { buildRecognitionActionColumns } from './tableColumns/recognitionActionColumnsBuilder'

interface UseNodeStatisticsTableColumnsOptions {
  isMobile: Ref<boolean>
  statMode: Ref<StatMode>
}

export const useNodeStatisticsTableColumns = (
  options: UseNodeStatisticsTableColumnsOptions,
) => {
  const nodeColumns = computed(() => buildNodeColumns(options.isMobile.value))

  const recognitionActionColumns = computed(() => buildRecognitionActionColumns(options.isMobile.value))

  const columns = computed(() => {
    return options.statMode.value === 'node' ? nodeColumns.value : recognitionActionColumns.value
  })

  return {
    nodeColumns,
    recognitionActionColumns,
    columns,
  }
}
