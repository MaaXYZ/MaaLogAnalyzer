import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { extractFrameworkSessionsFromPath, loadFrameworkLogSources } from '../frameworkInput'
import { extractFrameworkSessions } from '../frameworkVersion'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) => rm(root, { recursive: true, force: true })),
  )
})

const loggerLine = (timestamp: string, message: string): string =>
  `[${timestamp}][DBG][Px1][Tx1][Logger] ${message}`

const eventLine = (timestamp: string, message: string): string =>
  `[${timestamp}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details={}]`

const sessionLog = (version: string, start: string): string =>
  [
    loggerLine(start, 'MAA Process Start'),
    loggerLine(start.replace('.000', '.010'), `Version ${version}`),
    eventLine(start.replace('.000', '.020'), 'Tasker.Task.Starting'),
    eventLine(start.replace('.000', '.030'), 'Tasker.Task.Succeeded'),
  ].join('\n')

const makeDir = async (prefix: string): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

/** 流式提取与旧「整段加载 + 提取」路径必须逐字段一致。 */
const expectSameAsLegacy = async (targetPath: string): Promise<void> => {
  const streamed = await extractFrameworkSessionsFromPath(targetPath)
  const legacy = extractFrameworkSessions(await loadFrameworkLogSources(targetPath))
  expect(JSON.stringify(streamed)).toBe(JSON.stringify(legacy))
}

describe('extractFrameworkSessionsFromPath', () => {
  it('matches the whole-content extraction for a directory with rotated plain segments', async () => {
    const root = await makeDir('mla-framework-stream-')
    const debugDir = path.join(root, 'debug')
    await mkdir(debugDir, { recursive: true })
    await writeFile(
      path.join(debugDir, 'maafw.bak.2026.04.14-04.11.31.124.log'),
      sessionLog('v5.10.4', '2026-04-14 04:00:00.000'),
    )
    await writeFile(
      path.join(debugDir, 'maafw.log'),
      sessionLog('v5.11.1', '2026-04-14 05:00:00.000'),
    )

    await expectSameAsLegacy(root)
    const extraction = await extractFrameworkSessionsFromPath(root)
    expect(extraction.sessions).toHaveLength(2)
    expect(extraction.sessions.map((session) => session.version)).toEqual(['v5.10.4', 'v5.11.1'])
    expect(extraction.summary).toEqual({ status: 'multiple', versions: ['v5.10.4', 'v5.11.1'] })
  })

  it('matches the whole-content extraction when a rotated segment is gzipped', async () => {
    const root = await makeDir('mla-framework-stream-gz-')
    const debugDir = path.join(root, 'debug')
    await mkdir(debugDir, { recursive: true })
    await writeFile(
      path.join(debugDir, 'maafw.bak.2026.04.14-04.11.31.124.log.gz'),
      gzipSync(strToU8(sessionLog('v5.10.4', '2026-04-14 04:00:00.000'))),
    )
    await writeFile(
      path.join(debugDir, 'maafw.log'),
      sessionLog('v5.11.1', '2026-04-14 05:00:00.000'),
    )

    await expectSameAsLegacy(root)
  })

  it('matches the whole-content extraction for partial prefixes and conflicting versions', async () => {
    const root = await makeDir('mla-framework-stream-partial-')
    const debugDir = path.join(root, 'debug')
    await mkdir(debugDir, { recursive: true })
    // 首个分卷从中途开始：只有版本头和事件，没有 Process Start → partial_file 会话
    await writeFile(
      path.join(debugDir, 'maafw.bak.2026.04.14-03.00.00.000.log'),
      [
        loggerLine('2026-04-14 03:00:00.000', 'Version v5.9.0'),
        eventLine('2026-04-14 03:00:00.100', 'Tasker.Task.Starting'),
      ].join('\n'),
    )
    // 主日志内两个进程会话，其中第二个版本头不同 → conflict 会话
    await writeFile(
      path.join(debugDir, 'maafw.log'),
      [
        sessionLog('v5.11.1', '2026-04-14 05:00:00.000'),
        sessionLog('v5.12.0', '2026-04-14 06:00:00.000'),
        loggerLine('2026-04-14 06:10:00.000', 'Version v5.13.0'),
      ].join('\n'),
    )

    await expectSameAsLegacy(root)
    const extraction = await extractFrameworkSessionsFromPath(root)
    expect(extraction.warnings.length).toBeGreaterThan(0)
  })

  it('matches the whole-content extraction for a single log file', async () => {
    const root = await makeDir('mla-framework-stream-file-')
    const filePath = path.join(root, 'maa.log')
    await writeFile(
      filePath,
      [sessionLog('v5.11.1', '2026-04-14 05:00:00.000'), sessionLog('v5.11.1', '2026-04-14 06:00:00.000')].join('\n'),
    )

    await expectSameAsLegacy(filePath)
    expect((await extractFrameworkSessionsFromPath(filePath)).sessions).toHaveLength(2)
  })

  it('matches the whole-content extraction for a zip archive (whole-archive fallback)', async () => {
    const root = await makeDir('mla-framework-stream-zip-')
    const zipPath = path.join(root, 'logs.zip')
    await writeFile(
      zipPath,
      zipSync({
        'debug/maafw.log': strToU8(sessionLog('v5.11.1', '2026-04-14 05:00:00.000')),
        'debug/maa.log': strToU8(sessionLog('v4.4.0', '2026-04-14 04:00:00.000')),
      }),
    )

    await expectSameAsLegacy(zipPath)
    const extraction = await extractFrameworkSessionsFromPath(zipPath)
    expect(extraction.summary).toEqual({ status: 'single', versions: ['v5.11.1'] })
  })
})
