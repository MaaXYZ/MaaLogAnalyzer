import { afterEach, describe, expect, it, vi } from 'vitest'
import { markCurrentTutorialVersionCompleted } from './tutorialProgress'

describe('tutorial progress persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to the legacy version value after a structured write failure', () => {
    const setItem = vi.fn().mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem,
    })

    expect(() => markCurrentTutorialVersionCompleted('tour', 3, ['open-file'])).not.toThrow()
    expect(setItem).toHaveBeenLastCalledWith('tour', '3')
  })

  it('does not fail the tutorial flow when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('storage disabled')
      }),
    })

    expect(() => markCurrentTutorialVersionCompleted('tour', 3, ['open-file'])).not.toThrow()
  })

  it('replaces an invalid persisted array with structured progress', () => {
    let saved = '[]'
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => saved),
      setItem: vi.fn((_key: string, value: string) => {
        saved = value
      }),
    })

    markCurrentTutorialVersionCompleted('tour', 3, ['open-file'])

    expect(JSON.parse(saved)).toMatchObject({
      completedVersion: 3,
      completedStepIds: ['open-file'],
      activeVersion: 3,
    })
  })
})
