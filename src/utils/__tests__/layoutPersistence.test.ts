import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import {
  APP_LAYOUT_STORAGE_KEY,
  PROCESS_LAYOUT_STORAGE_KEY,
  TEXT_SEARCH_LAYOUT_STORAGE_KEY,
  resetPersistedLayouts,
} from '../layoutPersistence'
import { useAppViewState } from '../../views/app/composables/useAppViewState'
import { useProcessLayout } from '../../views/process/composables/useProcessLayout'
import { useTextSearchLayout } from '../../views/textSearch/composables/useTextSearchLayout'

describe('persisted layout reset', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map([
      [APP_LAYOUT_STORAGE_KEY, JSON.stringify({ analysisSplitSize: 0.8, splitVerticalSize: 0.7 })],
      [
        PROCESS_LAYOUT_STORAGE_KEY,
        JSON.stringify({ taskListCollapsed: true, nodeNavCollapsed: true }),
      ],
      [TEXT_SEARCH_LAYOUT_STORAGE_KEY, JSON.stringify({ splitSize: 0.7 })],
    ])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })

  it('clears every layout key and resets active layout refs', async () => {
    const app = useAppViewState()
    const process = useProcessLayout({
      detailViewCollapsed: app.detailViewCollapsed,
      displayMode: ref('tree'),
    })
    const search = useTextSearchLayout(TEXT_SEARCH_LAYOUT_STORAGE_KEY)

    expect(app.splitSize.value).toBe(0.8)
    expect(process.taskListCollapsed.value).toBe(true)
    expect(search.textSearchSplitSize.value).toBe(0.7)

    resetPersistedLayouts()
    await nextTick()

    expect(app.splitSize.value).toBe(0.65)
    expect(app.splitVerticalSize.value).toBe(0.5)
    expect(process.taskListCollapsed.value).toBe(false)
    expect(process.taskListSize.value).toBe(0.25)
    expect(process.nodeNavCollapsed.value).toBe(false)
    expect(process.nodeNavSize.value).toBe(0.35)
    expect(search.textSearchSplitSize.value).toBe(0.4)
    expect(values.get(APP_LAYOUT_STORAGE_KEY)).toContain('"analysisSplitSize":0.65')
    expect(values.get(PROCESS_LAYOUT_STORAGE_KEY)).toContain('"taskListCollapsed":false')
    expect(values.get(TEXT_SEARCH_LAYOUT_STORAGE_KEY)).toContain('"splitSize":0.4')
  })
})
