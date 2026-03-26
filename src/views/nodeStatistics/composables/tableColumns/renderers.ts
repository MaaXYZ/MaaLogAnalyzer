import { h } from 'vue'
import { NFlex, NProgress, NTag, NText } from 'naive-ui'

export const renderSuccessRateProgress = (rate: number) => {
  const color = rate >= 95 ? 'success' : rate >= 80 ? 'warning' : 'error'
  return h(NProgress, {
    type: 'line',
    percentage: rate,
    status: color,
    showIndicator: true,
    height: 18,
    borderRadius: 4,
  })
}

export const renderNodeStatusTags = (successCount: number, failCount: number) => {
  return h(NFlex, { justify: 'center', align: 'center', style: { gap: '4px' } }, () => [
    h(NTag, { type: 'success', size: 'small' }, () => successCount),
    h(NText, { depth: 3 }, () => '/'),
    h(NTag, { type: 'error', size: 'small' }, () => failCount),
  ])
}
