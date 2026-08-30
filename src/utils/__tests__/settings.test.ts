import { beforeEach, describe, expect, it, vi } from 'vitest'

const SETTINGS_KEY = 'maa-log-analyzer-settings'

describe('settings persistence validation', () => {
  let values: Map<string, string>

  beforeEach(() => {
    vi.resetModules()
    values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })

  it('accepts valid fields and falls back for invalid persisted values', async () => {
    values.set(
      SETTINGS_KEY,
      JSON.stringify({
        showNotRecognizedNodes: false,
        defaultCollapseRecognition: 'false',
        displayMode: 'grid',
        flowchartEdgeStyle: 'curved',
        flowchartEdgeFlowEnabled: false,
        flowchartPlaybackIntervalMs: -1,
        flowchartFocusZoom: 100,
        unknownField: 'ignored',
      }),
    )

    const { getSettings } = await import('../settings')

    expect(getSettings()).toMatchObject({
      showNotRecognizedNodes: false,
      defaultCollapseRecognition: false,
      displayMode: 'tree',
      flowchartEdgeStyle: 'orthogonal',
      flowchartEdgeFlowEnabled: false,
      flowchartPlaybackIntervalMs: 900,
      flowchartFocusZoom: 1,
    })
    expect('unknownField' in getSettings()).toBe(false)
  })

  it.each(['null', '[]', '"invalid"'])('ignores non-object persisted JSON: %s', async (raw) => {
    values.set(SETTINGS_KEY, raw)
    const { getDefaultSettings, getSettings } = await import('../settings')

    expect(getSettings()).toEqual(getDefaultSettings())
  })

  it('normalizes runtime values before saving and updating the singleton', async () => {
    const { getSettings, saveSettings } = await import('../settings')
    const settings = getSettings()
    Object.assign(settings, {
      displayMode: 'invalid',
      flowchartPlaybackIntervalMs: Number.POSITIVE_INFINITY,
      flowchartFocusZoom: 0,
    })

    saveSettings(settings)

    expect(settings).toMatchObject({
      displayMode: 'tree',
      flowchartPlaybackIntervalMs: 900,
      flowchartFocusZoom: 1,
    })
    expect(JSON.parse(values.get(SETTINGS_KEY)!)).toMatchObject({
      displayMode: 'tree',
      flowchartPlaybackIntervalMs: 900,
      flowchartFocusZoom: 1,
    })
  })
})
