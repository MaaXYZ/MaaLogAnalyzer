import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { loadFrameworkLogSources } from '../frameworkInput'
import { extractFrameworkSessions } from '../frameworkVersion'

const tempRoots: string[] = []

const loggerLine = (timestamp: string, message: string): string => {
  return `[${timestamp}][DBG][Px1][Tx1][Logger] ${message}`
}

const log = (version: string): string =>
  [
    loggerLine('2026-07-01 10:00:00.000', 'MAA Process Start'),
    loggerLine('2026-07-01 10:00:00.010', `Version ${version}`),
  ].join('\n')

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  )
})

describe('loadFrameworkLogSources', () => {
  it('prefers maafw.log over a co-located legacy maa.log in a zip', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-framework-input-'))
    tempRoots.push(root)
    const zipPath = path.join(root, 'logs.zip')
    await writeFile(
      zipPath,
      zipSync({
        'debug/maafw.log': strToU8(log('v5.11.1')),
        'debug/maa.log': strToU8(log('v4.4.0')),
      }),
    )

    const sources = await loadFrameworkLogSources(zipPath)
    expect(sources.map((source) => source.name)).toEqual(['maafw.log'])
    expect(sources[0]?.reference).toContain('zip:')
    expect(extractFrameworkSessions(sources).summary).toEqual({
      status: 'single',
      versions: ['v5.11.1'],
    })
  })

  it('retains physical file references for directory logs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-framework-input-'))
    tempRoots.push(root)
    const debugPath = path.join(root, 'debug')
    await mkdir(debugPath)
    await writeFile(path.join(debugPath, 'maafw.log'), log('v5.10.4'))

    const sources = await loadFrameworkLogSources(root)
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      path: 'maafw.log',
      name: 'maafw.log',
    })
    expect(sources[0]?.reference).toMatch(/^file:/)
  })

  it('enforces archive compression-ratio limits before loading framework logs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-framework-input-'))
    tempRoots.push(root)
    const zipPath = path.join(root, 'logs.zip')
    await writeFile(
      zipPath,
      zipSync(
        {
          'debug/maafw.log': new Uint8Array(2_048),
        },
        { level: 9 },
      ),
    )

    await expect(
      loadFrameworkLogSources(zipPath, {
        archiveLimits: {
          compressionRatioMinBytes: 1,
          maxCompressionRatio: 2,
        },
      }),
    ).rejects.toMatchObject({
      name: 'ArchiveLimitError',
      code: 'compression-ratio',
    })
  })

  it('does not expand framework logs outside the selected base directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-framework-input-'))
    tempRoots.push(root)
    const zipPath = path.join(root, 'logs.zip')
    await writeFile(
      zipPath,
      zipSync({
        'debug/maafw.log': strToU8(log('v5.11.1')),
        'other/maa.log': new Uint8Array(1_024),
      }),
    )

    const sources = await loadFrameworkLogSources(zipPath, {
      archiveLimits: { maxFileBytes: 512, maxExtractedBytes: 512 },
    })
    expect(sources.map((source) => source.path)).toEqual(['debug/maafw.log'])
  })

  it('enforces standalone framework log file limits', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-framework-input-'))
    tempRoots.push(root)
    const logPath = path.join(root, 'maafw.log')
    await writeFile(logPath, log('v5.11.1'))

    await expect(
      loadFrameworkLogSources(logPath, {
        archiveLimits: { maxFileBytes: 8 },
      }),
    ).rejects.toMatchObject({
      name: 'ArchiveLimitError',
      code: 'file-size',
    })
  })
})
