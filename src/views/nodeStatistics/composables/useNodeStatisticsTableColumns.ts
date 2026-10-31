import { computed, type Ref } from 'vue'
import type { StatMode } from './useNodeStatisticsMetrics'
import { buildNodeColumns } from './tableColumns/nodeColumnsBuilder'
import { buildRecognitionActionColumns } from './tableColumns/recognitionActionColumnsBuilder'
import { buildWaitFreezeColumns } from './tableColumns/waitFreezeColumnsBuilder'
import { useIsCompactDesktop } from '../../../composables/useIsCompactDesktop'

interface UseNodeStatisticsTableColumnsOptions {
  isMobile: Ref<boolean>
  statMode: Ref<StatMode>
}

export const useNodeStatisticsTableColumns = (options: UseNodeStatisticsTableColumnsOptions) => {
  // 1100 以下（典型是 1024 笔记本窗口）10 列表格放不下，最右的成功率 / 成功·失败会被推到
  // 视口外。断点复用全局的「紧凑桌面」判断，避免这里再写一个 1100 跟别处漂移。
  const { isCompactDesktop } = useIsCompactDesktop()
  const nodeColumns = computed(() =>
    buildNodeColumns(options.isMobile.value, isCompactDesktop.value),
  )

  const recognitionActionColumns = computed(() =>
    buildRecognitionActionColumns(options.isMobile.value, isCompactDesktop.value),
  )

  const waitFreezeColumns = computed(() =>
    buildWaitFreezeColumns(options.isMobile.value, isCompactDesktop.value),
  )

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
