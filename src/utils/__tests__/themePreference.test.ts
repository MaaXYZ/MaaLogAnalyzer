import { afterEach, describe, expect, it, vi } from 'vitest'
import { readThemePreference, writeThemePreference } from '../themePreference'

describe('theme preference persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', null],
    ['', null],
    [null, null],
  ])('normalizes persisted value %#', (stored, expected) => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => stored) })
    expect(readThemePreference()).toBe(expected)
  })

  it('tolerates unavailable storage reads and writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('storage disabled')
      }),
      setItem: vi.fn(() => {
        throw new Error('storage disabled')
      }),
    })

    expect(readThemePreference()).toBeNull()
    expect(writeThemePreference('dark')).toBe(false)
  })

  it('persists a valid preference', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })

    expect(writeThemePreference('light')).toBe(true)
    expect(setItem).toHaveBeenCalledWith('theme', 'light')
  })
})
