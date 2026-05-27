export type DetailRow = {
  label: string
  value: unknown
  span?: number
}

export const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const hasDetailValue = (value: unknown) =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.length === 0)

export const formatDetailValue = (value: unknown, maxLength = 300): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatDetailValue(item, maxLength)).join(', ')}]`
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (isRecord(value)) {
    const text = JSON.stringify(value)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
  return String(value)
}

const pickFirst = (record: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    if (hasDetailValue(record[key])) return record[key]
  }
  return undefined
}

const pushValue = (rows: DetailRow[], label: string, value: unknown, span?: number) => {
  if (hasDetailValue(value)) rows.push({ label, value, span })
}

const formatRecognitionResultSummary = (value: unknown) => {
  if (!isRecord(value)) return null
  const parts: string[] = []
  if (Array.isArray(value.box)) parts.push(`box=[${value.box.join(', ')}]`)
  if (hasDetailValue(value.score)) parts.push(`score=${value.score}`)
  if (hasDetailValue(value.text)) parts.push(`text=${value.text}`)
  if (hasDetailValue(value.count)) parts.push(`count=${value.count}`)
  if (hasDetailValue(value.label)) parts.push(`label=${value.label}`)
  if (hasDetailValue(value.cls_index)) parts.push(`cls_index=${value.cls_index}`)
  if (isRecord(value.detail)) {
    const text = JSON.stringify(value.detail)
    parts.push(`detail=${text.length > 160 ? `${text.slice(0, 160)}...` : text}`)
  }
  return parts.length > 0 ? parts.join(' | ') : formatDetailValue(value, 240)
}

export const buildRecognitionDetailRows = (
  recognition: any,
  descriptionColumns: number,
): DetailRow[] => {
  if (!recognition) return []

  const rows: DetailRow[] = [{
    label: '命中状态',
    value: recognition.box ? '命中' : '未命中',
  }]

  const detail = recognition.detail
  if (Array.isArray(detail)) {
    const hitChildren = detail.filter((item) => isRecord(item) && item.box).length
    rows.push(
      { label: '子识别数量', value: detail.length },
      { label: '命中子识别数量', value: hitChildren },
    )

    const children = detail
      .filter(isRecord)
      .slice(0, 8)
      .map((item) => `${item.name ?? '-'} (${item.algorithm ?? '-'})${item.box ? ` [${item.box.join(', ')}]` : ''}`)
    if (children.length > 0) {
      rows.push({ label: '子识别列表', value: children.join('\n'), span: descriptionColumns })
    }
    return rows
  }

  if (isRecord(detail)) {
    if (Array.isArray(detail.all)) rows.push({ label: '全部结果', value: detail.all.length })
    if (Array.isArray(detail.filtered)) rows.push({ label: '过滤结果', value: detail.filtered.length })
    if (hasDetailValue(detail.best)) {
      rows.push({
        label: '最佳结果',
        value: formatRecognitionResultSummary(detail.best),
        span: descriptionColumns,
      })
    }
  }

  return rows
}

const pushPointerRows = (rows: DetailRow[], detail: Record<string, any>) => {
  pushValue(rows, '实际坐标', pickFirst(detail, ['point']))
  pushValue(rows, '触点', pickFirst(detail, ['contact']))
  pushValue(rows, '压力', pickFirst(detail, ['pressure']))
}

const pushSwipeRows = (rows: DetailRow[], detail: Record<string, any>, descriptionColumns: number) => {
  pushValue(rows, '起点', pickFirst(detail, ['begin']))
  pushValue(rows, '终点', pickFirst(detail, ['end']), descriptionColumns)
  pushValue(rows, '持续时间', pickFirst(detail, ['duration']))
  pushValue(rows, '终点停留', pickFirst(detail, ['end_hold']))
  pushValue(rows, '开始延迟', pickFirst(detail, ['starting']))
  pushValue(rows, '仅悬停', pickFirst(detail, ['only_hover']))
  pushValue(rows, '触点', pickFirst(detail, ['contact']))
  pushValue(rows, '压力', pickFirst(detail, ['pressure']))
}

export const buildActionDetailRows = (
  actionDetails: any,
  descriptionColumns: number,
): DetailRow[] => {
  const detail = actionDetails?.detail
  if (!isRecord(detail)) return []

  const rows: DetailRow[] = []
  const action = actionDetails?.action

  switch (action) {
    case 'Click':
    case 'LongPress':
    case 'TouchDown':
    case 'TouchMove':
      pushPointerRows(rows, detail)
      pushValue(rows, '持续时间', pickFirst(detail, ['duration']))
      break
    case 'Swipe':
      pushSwipeRows(rows, detail, descriptionColumns)
      break
    case 'MultiSwipe':
      pushValue(rows, '滑动数量', Array.isArray(detail.swipes) ? detail.swipes.length : undefined)
      pushValue(rows, '多指滑动', detail.swipes, descriptionColumns)
      break
    case 'ClickKey':
    case 'LongPressKey':
    case 'KeyDown':
    case 'KeyUp':
      pushValue(rows, '按键', pickFirst(detail, ['keycode', 'key']))
      pushValue(rows, '持续时间', pickFirst(detail, ['duration']))
      break
    case 'InputText':
      pushValue(rows, '输入文本', pickFirst(detail, ['text', 'input_text']), descriptionColumns)
      break
    case 'StartApp':
    case 'StopApp':
      pushValue(rows, '包名', pickFirst(detail, ['package']))
      break
    case 'Scroll':
      pushValue(rows, '实际坐标', pickFirst(detail, ['point']))
      pushValue(rows, '水平滚动', pickFirst(detail, ['dx']))
      pushValue(rows, '垂直滚动', pickFirst(detail, ['dy']))
      break
    case 'Shell':
      pushValue(rows, '命令', pickFirst(detail, ['cmd']), descriptionColumns)
      pushValue(rows, 'Shell 超时', pickFirst(detail, ['shell_timeout']))
      pushValue(rows, '详情结果', pickFirst(detail, ['success']))
      pushValue(rows, 'Shell 输出', pickFirst(detail, ['output']), descriptionColumns)
      break
    case 'Command':
      pushValue(rows, '命令', pickFirst(detail, ['exec']), descriptionColumns)
      pushValue(rows, '命令参数', pickFirst(detail, ['args']), descriptionColumns)
      break
    case 'Screencap':
      pushValue(rows, '截图路径', pickFirst(detail, ['filepath']), descriptionColumns)
      pushValue(rows, '截图格式', pickFirst(detail, ['format']))
      pushValue(rows, '截图质量', pickFirst(detail, ['quality']))
      pushValue(rows, '详情结果', pickFirst(detail, ['success']))
      break
    default:
      pushValue(rows, '实际坐标', pickFirst(detail, ['point']))
      pushValue(rows, '起点', pickFirst(detail, ['begin']))
      pushValue(rows, '终点', pickFirst(detail, ['end']), descriptionColumns)
      pushValue(rows, '滑动数量', Array.isArray(detail.swipes) ? detail.swipes.length : undefined)
      pushValue(rows, '按键', pickFirst(detail, ['keycode', 'key']))
      pushValue(rows, '持续时间', pickFirst(detail, ['duration']))
      pushValue(rows, '触点', pickFirst(detail, ['contact']))
      pushValue(rows, '压力', pickFirst(detail, ['pressure']))
      pushValue(rows, '命令', pickFirst(detail, ['cmd', 'exec']), descriptionColumns)
      pushValue(rows, 'Shell 输出', pickFirst(detail, ['output']), descriptionColumns)
      pushValue(rows, '截图路径', pickFirst(detail, ['filepath']), descriptionColumns)
      pushValue(rows, '详情结果', pickFirst(detail, ['success']))
      break
  }

  return rows
}
