import { describe, expect, it } from 'vitest'
import {
  buildActionDetailRows,
  buildRecognitionDetailRows,
  formatDetailValue,
} from './detailRows'

describe('detailRows', () => {
  it('builds OCR recognition result rows from all/filtered/best', () => {
    const rows = buildRecognitionDetailRows({
      box: [10, 20, 30, 40],
      detail: {
        all: [
          { box: [10, 20, 30, 40], score: 0.92, text: 'OK' },
          { box: [50, 60, 70, 80], score: 0.5, text: 'NO' },
        ],
        filtered: [
          { box: [10, 20, 30, 40], score: 0.92, text: 'OK' },
        ],
        best: { box: [10, 20, 30, 40], score: 0.92, text: 'OK' },
      },
    }, 2)

    expect(rows.map((row) => row.label)).toEqual(['命中状态', '全部结果', '过滤结果', '最佳结果'])
    expect(rows[0].value).toBe('命中')
    expect(rows[1].value).toBe(2)
    expect(rows[2].value).toBe(1)
    expect(rows[3].value).toContain('text=OK')
  })

  it('builds And/Or recognition child summaries', () => {
    const rows = buildRecognitionDetailRows({
      box: null,
      detail: [
        { name: 'Icon', algorithm: 'TemplateMatch', box: [1, 2, 3, 4] },
        { name: 'Text', algorithm: 'OCR', box: null },
      ],
    }, 3)

    expect(rows.map((row) => row.label)).toEqual(['命中状态', '子识别数量', '命中子识别数量', '子识别列表'])
    expect(rows[0].value).toBe('未命中')
    expect(rows[1].value).toBe(2)
    expect(rows[2].value).toBe(1)
    expect(rows[3].value).toContain('Icon (TemplateMatch) [1, 2, 3, 4]')
  })

  it('builds click action rows in action-specific order', () => {
    const rows = buildActionDetailRows({
      action: 'Click',
      detail: { point: [100, 200], contact: 1, pressure: 3 },
    }, 2)

    expect(rows.map((row) => row.label)).toEqual(['实际坐标', '触点', '压力'])
    expect(rows.map((row) => row.value)).toEqual([[100, 200], 1, 3])
  })

  it('builds swipe action rows with path fields before input metadata', () => {
    const rows = buildActionDetailRows({
      action: 'Swipe',
      detail: {
        begin: [10, 20],
        end: [[30, 40], [50, 60]],
        duration: [100, 120],
        end_hold: [0, 20],
        only_hover: false,
        contact: 0,
      },
    }, 2)

    expect(rows.map((row) => row.label)).toEqual(['起点', '终点', '持续时间', '终点停留', '仅悬停', '触点'])
    expect(rows[1]).toMatchObject({ label: '终点', span: 2 })
  })

  it('builds shell and screencap rows from MaaFramework runtime detail', () => {
    const shellRows = buildActionDetailRows({
      action: 'Shell',
      detail: { cmd: 'echo ok', shell_timeout: 20000, success: true, output: 'ok\n' },
    }, 2)
    expect(shellRows.map((row) => row.label)).toEqual(['命令', 'Shell 超时', '详情结果', 'Shell 输出'])
    expect(shellRows[3]).toMatchObject({ value: 'ok\n', span: 2 })

    const screencapRows = buildActionDetailRows({
      action: 'Screencap',
      detail: { filepath: '/tmp/a.png', format: 'png', quality: 100, success: true },
    }, 2)
    expect(screencapRows.map((row) => row.label)).toEqual(['截图路径', '截图格式', '截图质量', '详情结果'])
  })

  it('formats nested values predictably for table cells', () => {
    expect(formatDetailValue([1, [2, 3], true])).toBe('[1, [2, 3], true]')
    expect(formatDetailValue({ a: 1 })).toBe('{"a":1}')
  })
})
