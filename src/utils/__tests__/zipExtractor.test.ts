import { afterEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { extractZipContent, extractZipContents } from '../zipExtractor'
import type { PrimaryLogSelectionOption } from '../logFileDiscovery'
import { decodeFileContent } from '../textEncoding'
import { toExactArrayBuffer } from '../logInputSource'

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
    expect(result?.primaryLogFiles).toHaveLength(1)
    expect(result?.primaryLogFiles[0]).toMatchObject({
      path: 'maa.log',
      name: 'maa.log',
    })
    const primary = result!.primaryLogFiles[0]
    expect('bytes' in primary && decodeFileContent(primary.bytes)).toBe(
      '[2026-04-16 14:55:00.000][INF][Px1][Tx1][test] AutoCollectStart\n',
    )
    if ('bytes' in primary) {
      const transferred = toExactArrayBuffer(primary.bytes)
      structuredClone(transferred, { transfer: [transferred] })
      expect(primary.bytes.byteLength).toBe(0)
    }
    expect(await result?.primaryLogFiles[0]?.loadContent?.()).toBe(
      '[2026-04-16 14:55:00.000][INF][Px1][Tx1][test] AutoCollectStart\n',
    )
    expect(result?.textFiles).toHaveLength(1)
    expect(result?.textFiles[0]).toMatchObject({
      path: 'runtime.txt',
      name: 'runtime.txt',
    })
    expect(await result?.textFiles[0]?.loadContent?.()).toBe('extra searchable text')
    expect(result?.errorImages.has('2026.04.16-14.57.56.745_AutoCollectRoute1AssertLocation')).toBe(
      true,
    )
    expect(result?.visionImages.has('2026.04.16-14.57.57.123_AutoCollectRoute1_123456789')).toBe(
      true,
    )
    expect(
      result?.waitFreezesImages.has('2026.04.16-14.57.58.456_AutoCollectRoute1_wait_freezes'),
    ).toBe(true)
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

  it('extracts only the primary logs returned by the selection callback', async () => {
    const zipData = zipSync({
      'debug/maa.bak.2026.04.16-14.00.00.000.log': strToU8(
        '[2026-04-16 14:00:00.000][INF] historical log\n',
      ),
      'debug/maa.log': strToU8('[2026-04-16 15:00:00.000][INF] current log\n'),
    })
    const selectCurrent = vi.fn(async (options: PrimaryLogSelectionOption[]) =>
      options.filter((option) => option.kind === 'main'),
    )

    const result = await extractZipContent(
      new File([toArrayBuffer(zipData)], 'selected-primary.zip'),
      selectCurrent,
      { includeAuxiliaryFiles: false },
    )

    expect(selectCurrent).toHaveBeenCalledOnce()
    expect(selectCurrent.mock.calls[0]?.[0]).toHaveLength(2)
    expect(result?.primaryLogFiles).toHaveLength(1)
    expect(result?.primaryLogFiles[0]).toMatchObject({
      path: 'debug/maa.log',
      name: 'maa.log',
    })
    expect(await result?.primaryLogFiles[0]?.loadContent?.()).toBe(
      '[2026-04-16 15:00:00.000][INF] current log\n',
    )
  })

  it('merges independent MXU ZIP volumes before discovering logs and assets', async () => {
    const firstVolume = zipSync({
      'maa.log': strToU8('[2026-04-16 14:55:00.000][INF] primary log\n'),
    })
    const secondVolume = zipSync({
      'runtime.txt': strToU8('text from another volume'),
      'on_error/2026.04.16-14.57.56.745_Node.png': strToU8('fake-png'),
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')

    const result = await extractZipContents([
      new File([toArrayBuffer(firstVolume)], 'MXU-logs-20260717-120000-part01.zip'),
      new File([toArrayBuffer(secondVolume)], 'MXU-logs-20260717-120000-part02.zip'),
    ])

    expect(result?.primaryLogFiles).toHaveLength(1)
    expect(result?.textFiles).toHaveLength(1)
    expect(result?.textFiles[0]).toMatchObject({
      path: 'runtime.txt',
      name: 'runtime.txt',
    })
    expect(await result?.textFiles[0]?.loadContent?.()).toBe('text from another volume')
    expect(result?.errorImages.has('2026.04.16-14.57.56.745_Node')).toBe(true)
  })
})
