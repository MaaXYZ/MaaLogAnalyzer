import { afterEach, describe, expect, it, vi } from 'vitest'

const unzipCall = vi.hoisted(() => vi.fn())

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>()
  const trackedUnzip = ((...args: unknown[]) => {
    unzipCall()
    return Reflect.apply(actual.unzip, undefined, args)
  }) as typeof actual.unzip
  return { ...actual, unzip: trackedUnzip }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { strToU8, zipSync } from 'fflate'
import { extractZipContent } from '../zipExtractor'

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

describe('ZIP extraction resource budgets', () => {
  afterEach(() => {
    unzipCall.mockClear()
  })

  it('rejects oversized File metadata before calling arrayBuffer', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0))
    const oversizedFile = {
      name: 'oversized.zip',
      size: 11,
      arrayBuffer,
    } as unknown as File

    await expect(extractZipContent(oversizedFile, undefined, {
      archiveLimits: { maxCompressedBytes: 10 },
    })).rejects.toMatchObject({ code: 'compressed-size' })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(unzipCall).not.toHaveBeenCalled()
  })

  it('uses preserved compressed and original sizes before inflating selected files', async () => {
    const zipData = zipSync({
      'maa.log': [strToU8('x'.repeat(2_048)), { level: 9 }],
    })

    await expect(extractZipContent(
      new File([toArrayBuffer(zipData)], 'high-ratio.zip'),
      undefined,
      {
        includeAuxiliaryFiles: false,
        archiveLimits: {
          maxFileBytes: 4_096,
          maxExtractedBytes: 4_096,
          maxCompressionRatio: 2,
          compressionRatioMinBytes: 1,
        },
      },
    )).rejects.toMatchObject({ code: 'compression-ratio' })
    expect(unzipCall).not.toHaveBeenCalled()
  })
})
