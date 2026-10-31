import { h } from 'vue'
import { NFlex, NProgress, NTag, NText } from 'naive-ui'

// 成功率档位：>=95 绿、>=60 琥珀、其余红。
//
// 为什么门槛是 60 而不是 80：这一列大部分值来自「4 次执行成功 3 次」这种小样本，
// 75% 在观感上应该和「基本成功」一类，之前落在 >=80 的下一档，被画成和 0% 一样的红色，
// 用户一眼看过去以为整份日志全崩了。红色只留给确实大面积失败的行。
// 颜色只用在进度条上，数值永远单独显示——之前把 status 交给 NProgress 后，naive-ui 会用
// ✓/✕ 图标顶掉百分比，导致这一列根本读不到数字，0% 时更是整格空白。
const resolveSuccessRateStatus = (rate: number): 'success' | 'warning' | 'error' => {
  if (rate >= 95) return 'success'
  if (rate >= 60) return 'warning'
  return 'error'
}

export const renderSuccessRateProgress = (rate: number) => {
  const status = resolveSuccessRateStatus(rate)
  const text = `${rate.toFixed(0)}%`
  return h(
    NFlex,
    { align: 'center', justify: 'center', style: { gap: '6px' }, wrap: false },
    () => [
      h(NProgress, {
        type: 'line',
        percentage: Math.max(0, Math.min(100, rate)),
        status,
        showIndicator: false,
        height: 8,
        borderRadius: 4,
        style: { flex: '1 1 auto', minWidth: '0' },
      }),
      h(
        NText,
        {
          depth: 2,
          style: {
            fontSize: '12px',
            fontVariantNumeric: 'tabular-nums',
            flex: '0 0 auto',
            minWidth: '36px',
            textAlign: 'right',
          },
        },
        () => text,
      ),
    ],
  )
}

export const renderNodeStatusTags = (successCount: number, failCount: number) => {
  return h(NFlex, { justify: 'center', align: 'center', style: { gap: '4px' } }, () => [
    h(NTag, { type: 'success', size: 'small' }, () => successCount),
    h(NText, { depth: 3 }, () => '/'),
    h(NTag, { type: 'error', size: 'small' }, () => failCount),
  ])
}
