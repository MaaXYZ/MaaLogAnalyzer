import { describe, expect, it } from 'vitest'
import {
  combineLoadedPrimaryLogSegments,
  createPrimaryLogSelectionOptions,
  createPrimaryLogParseInputs,
  isBakLogFileName,
  isMainLogFileName,
  isPrimaryLogFileName,
  selectPrimaryLogGroup,
  sortLoadedPrimaryLogSegments,
} from '../logFileDiscovery'

describe('logFileDiscovery', () => {
  it('recognizes legacy and rotated primary log file names', () => {
    expect(isMainLogFileName('maa.log')).toBe(true)
    expect(isMainLogFileName('maafw.log')).toBe(true)
    expect(isBakLogFileName('maa.bak.log')).toBe(true)
    expect(isBakLogFileName('maafw.bak.2026.04.14-04.37.25.209.log')).toBe(true)
    expect(isPrimaryLogFileName('mxu-web-2026-04-14.log')).toBe(false)
    expect(isPrimaryLogFileName('go-service.log')).toBe(false)
  })

  it('prefers the current-folder group before deeper groups', () => {
    const selected = selectPrimaryLogGroup([
      { path: 'root/maa.bak.log', name: 'maa.bak.log' },
      {
        path: 'root/debug/maafw.bak.2026.04.14-04.11.31.124.log',
        name: 'maafw.bak.2026.04.14-04.11.31.124.log',
      },
      { path: 'root/debug/maafw.log', name: 'maafw.log' },
    ])

    expect(selected.map((entry) => entry.item.path)).toEqual(['root/maa.bak.log'])
  })

  it('prefers the same-depth group that contains a main log', () => {
    const selected = selectPrimaryLogGroup([
      { path: 'root/debug-a/maa.bak.log', name: 'maa.bak.log' },
      {
        path: 'root/debug-b/maafw.bak.2026.04.14-04.11.31.124.log',
        name: 'maafw.bak.2026.04.14-04.11.31.124.log',
      },
      { path: 'root/debug-b/maafw.log', name: 'maafw.log' },
    ])

    expect(selected.map((entry) => entry.item.path)).toEqual([
      'root/debug-b/maafw.bak.2026.04.14-04.11.31.124.log',
      'root/debug-b/maafw.log',
    ])
  })

  it('sorts and combines mixed legacy and rotated logs by actual start time', () => {
    const segments = [
      {
        path: 'sample/focus/maafw.log',
        name: 'maafw.log',
        content: '[2026-04-14 04:37:25.504][DBG] current\n',
      },
      {
        path: 'sample/focus/maafw.bak.2026.04.14-04.13.42.591.log',
        name: 'maafw.bak.2026.04.14-04.13.42.591.log',
        content: '[2026-04-14 04:11:31.140][DBG] bak-2\n',
      },
      {
        path: 'sample/focus/maa.log',
        name: 'maa.log',
        content: '[2026-04-13 06:07:22.681][DBG] legacy-current\n',
      },
      {
        path: 'sample/focus/maafw.bak.2026.04.14-04.11.31.124.log',
        name: 'maafw.bak.2026.04.14-04.11.31.124.log',
        content: '[2026-04-13 22:36:52.556][DBG] bak-1\n',
      },
      {
        path: 'sample/focus/maa.bak.log',
        name: 'maa.bak.log',
        content: '[2026-04-13 05:18:03.641][DBG] legacy-bak\n',
      },
      {
        path: 'sample/focus/maafw.bak.2026.04.14-04.37.25.209.log',
        name: 'maafw.bak.2026.04.14-04.37.25.209.log',
        content: '[2026-04-14 04:13:42.603][DBG] bak-3\n',
      },
    ]

    const sorted = sortLoadedPrimaryLogSegments(segments)

    expect(sorted.map((segment) => segment.name)).toEqual([
      'maa.bak.log',
      'maa.log',
      'maafw.bak.2026.04.14-04.11.31.124.log',
      'maafw.bak.2026.04.14-04.13.42.591.log',
      'maafw.bak.2026.04.14-04.37.25.209.log',
      'maafw.log',
    ])

    expect(combineLoadedPrimaryLogSegments(segments)).toContain(
      '[2026-04-13 05:18:03.641][DBG] legacy-bak\n[2026-04-13 06:07:22.681][DBG] legacy-current\n',
    )
    expect(
      combineLoadedPrimaryLogSegments(segments)
        .trimEnd()
        .endsWith('[2026-04-14 04:37:25.504][DBG] current'),
    ).toBe(true)
  })

  it('creates parse inputs in primary log order without combining content', () => {
    const inputs = createPrimaryLogParseInputs([
      {
        path: 'sample/focus/maafw.log',
        name: 'maafw.log',
        content: '[2026-04-14 04:37:25.504][DBG] current\n',
      },
      {
        path: 'sample/focus/maafw.bak.2026.04.14-04.11.31.124.log',
        name: 'maafw.bak.2026.04.14-04.11.31.124.log',
        content: '[2026-04-13 22:36:52.556][DBG] bak\n',
      },
    ])

    expect(inputs).toEqual([
      {
        content: '[2026-04-13 22:36:52.556][DBG] bak\n',
        sourceKey: 'sample/focus/maafw.bak.2026.04.14-04.11.31.124.log',
        sourcePath: 'sample/focus/maafw.bak.2026.04.14-04.11.31.124.log',
        inputIndex: 0,
      },
      {
        content: '[2026-04-14 04:37:25.504][DBG] current\n',
        sourceKey: 'sample/focus/maafw.log',
        sourcePath: 'sample/focus/maafw.log',
        inputIndex: 1,
      },
    ])
  })

  it('creates default-selected primary log options from the current group', () => {
    const options = createPrimaryLogSelectionOptions([
      { path: 'root/debug/maafw.log', name: 'maafw.log' },
      {
        path: 'root/debug/maafw.bak.2026.04.14-04.11.31.124.log',
        name: 'maafw.bak.2026.04.14-04.11.31.124.log',
      },
    ])

    expect(options).toEqual([
      {
        path: 'root/debug/maafw.bak.2026.04.14-04.11.31.124.log',
        name: 'maafw.bak.2026.04.14-04.11.31.124.log',
        kind: 'bak',
        family: 'maafw',
        rotatedTimestampHint: '2026.04.14-04.11.31.124',
        selected: true,
      },
      {
        path: 'root/debug/maafw.log',
        name: 'maafw.log',
        kind: 'main',
        family: 'maafw',
        rotatedTimestampHint: null,
        selected: true,
      },
    ])
  })
})
