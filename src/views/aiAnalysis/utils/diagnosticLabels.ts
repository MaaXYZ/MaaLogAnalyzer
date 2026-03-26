export const onErrorTriggerTypeLabel = (value: string): string => {
  if (value === 'action_failed') return 'Action 失败触发'
  if (value === 'reco_timeout_or_nohit') return '识别超时/未命中触发'
  if (value === 'error_handling_loop') return 'on_error 循环触发'
  return value
}

export const onErrorRiskTagType = (value: string): 'error' | 'warning' | 'success' => {
  if (value === 'high') return 'error'
  if (value === 'medium') return 'warning'
  return 'success'
}

export const anchorClassLabel = (value: string): string => {
  if (value === 'unresolved_anchor_candidate_likely') return '疑似锚点未解析'
  if (value === 'failed_after_anchor_resolution') return '已解析但后续失败'
  if (value === 'recovered_or_succeeded') return '未见失败'
  return value
}

export const anchorClassTagType = (value: string): 'error' | 'warning' | 'success' | 'default' => {
  if (value === 'unresolved_anchor_candidate_likely') return 'error'
  if (value === 'failed_after_anchor_resolution') return 'warning'
  if (value === 'recovered_or_succeeded') return 'success'
  return 'default'
}

export const jumpBackClassLabel = (value: string): string => {
  if (value === 'hit_then_failed_no_return') return '命中后失败且未回跳'
  if (value === 'hit_then_returned') return '命中并回跳'
  if (value === 'hit_no_return_observed') return '命中后未观察到回跳'
  if (value === 'not_hit') return '未命中'
  return value
}

export const jumpBackClassTagType = (value: string): 'error' | 'warning' | 'success' | 'default' => {
  if (value === 'hit_then_failed_no_return') return 'error'
  if (value === 'hit_no_return_observed') return 'warning'
  if (value === 'hit_then_returned') return 'success'
  return 'default'
}
