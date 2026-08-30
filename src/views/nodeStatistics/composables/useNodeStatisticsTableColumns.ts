import { computed, type Ref } from 'vue'
import type { StatMode } from './useNodeStatisticsMetrics'
import { buildNodeColumns } from './tableColumns/nodeColumnsBuilder'
import { buildRecognitionActionColumns } from './tableColumns/recognitionActionColumnsBuilder'
import { buildWaitFreezeColumns } from './tableColumns/waitFreezeColumnsBuilder'

interface UseNodeStatisticsTableColumnsOptions {
  isMobile: Ref<boolean>
  statMode: Ref<StatMode>
}

export const useNodeStatisticsTableColumns = (
  options: UseNodeStatisticsTableColumnsOptions,
) => {
  const nodeColumns = computed(() => buildNodeColumns(options.isMobile.value))

  const recognitionActionColumns = computed(() => buildRecognitionActionColumns(options.isMobile.value))

  const waitFreezeColumns = computed(() => buildWaitFreezeColumns(options.isMobile.value))

  const columns = computed(() => {
    if (options.statMode.value === 'node') return nodeColumns.value
    if (options.statMode.value === 'recognition-action') return recognitionActionColumns.value
    return waitFreezeColumns.value
  })

  return {
    nodeColumns,
    recognitionActionColumns,
    waitFreezeColumns,
    columns,
  }
}
