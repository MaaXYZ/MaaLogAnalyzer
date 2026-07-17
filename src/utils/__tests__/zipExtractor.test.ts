import { afterEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { extractZipContent } from '../zipExtractor'

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

describe('extractZipContent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads root-level debug images from zip archives', async () => {
    const zipData = zipSync({
      'maa.log': strToU8('[2026-04-16 14:55:00.000][INF][Px1][Tx1][test] AutoCollectStart\n'),
      'runtime.txt': strToU8('extra searchable text'),
      'on_error/2026.04.16-14.57.56.745_AutoCollectRoute1AssertLocation.png': strToU8('fake-png'),
      'vision/2026.04.16-14.57.57.123_AutoCollectRoute1_123456789.jpg': strToU8('fake-jpg'),
      'vision/2026.04.16-14.57.58.456_AutoCollectRoute1_wait_freezes.jpg': strToU8('fake-jpg'),
    })

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      return `blob:mock-${Math.random().toString(36).slice(2)}`
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const result = await extractZipContent(new File([toArrayBuffer(zipData)], 'root-images.zip'))

    expect(result).not.toBeNull()
    expect(result?.content).toBe('')
    expect(result?.primaryLogFiles).toEqual([{
      path: 'maa.log',
      name: 'maa.log',
      content: '[2026-04-16 14:55:00.000][INF][Px1][Tx1][test] AutoCollectStart\n',
    }])
    expect(result?.textFiles).toEqual([{
      path: 'runtime.txt',
      name: 'runtime.txt',
      content: 'extra searchable text',
    }])
    expect(result?.errorImages.has('2026.04.16-14.57.56.745_AutoCollectRoute1AssertLocation')).toBe(true)
    expect(result?.visionImages.has('2026.04.16-14.57.57.123_AutoCollectRoute1_123456789')).toBe(true)
    expect(result?.waitFreezesImages.has('2026.04.16-14.57.58.456_AutoCollectRoute1_wait_freezes')).toBe(true)
    expect(createObjectUrl).toHaveBeenCalledTimes(3)
  })

  it('can extract only primary logs without inflating auxiliary files', async () => {
    const zipData = zipSync({
      'debug/maa.log': strToU8('[2026-04-16 14:55:00.000][INF] primary log\n'),
      'debug/runtime.txt': strToU8('large searchable text'),
      'debug/on_error/2026.04.16-14.57.56.745_Node.png': strToU8('fake-png'),
    })
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL')

    const result = await extractZipContent(
      new File([toArrayBuffer(zipData)], 'primary-only.zip'),
      undefined,
      { includeAuxiliaryFiles: false },
    )

    expect(result?.primaryLogFiles).toHaveLength(1)
    expect(result?.primaryLogFiles[0]?.path).toBe('debug/maa.log')
    expect(result?.textFiles).toEqual([])
    expect(result?.errorImages.size).toBe(0)
    expect(result?.visionImages.size).toBe(0)
    expect(result?.waitFreezesImages.size).toBe(0)
    expect(createObjectUrl).not.toHaveBeenCalled()
  })
})
