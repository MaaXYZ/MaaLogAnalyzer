import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { extractZipContentFromNodeBuffer, loadNodeLogDirectory } from '../nodeInput'

const tempRoots: string[] = []

const makeTimestampedLine = (timestamp: string, message: string): string => {
  return `[${timestamp}][INF][Px1][Tx1][test] ${message}`
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0, tempRoots.length).map((root) => rm(root, { recursive: true, force: true })))
})

describe('node input focus selectors', () => {
  it('keeps default directory loading behavior when focus is not provided', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-node-input-'))
    tempRoots.push(root)
    const debugDir = path.join(root, 'debug')
    await mkdir(debugDir, { recursive: true })

    await writeFile(path.join(debugDir, 'maa.bak.20260415.log'), `${makeTimestampedLine('2026-04-15 09:00:00.000', 'OldHistory')}\n`)
    await writeFile(path.join(debugDir, 'maa.bak.log'), `${makeTimestampedLine('2026-04-16 14:49:00.000', 'BaselineTask')}\n`)
    await writeFile(path.join(debugDir, 'maa.log'), `${makeTimestampedLine('2026-04-16 14:55:00.000', 'FocusedTask')}\n`)

    const extracted = await loadNodeLogDirectory(root)
    expect(extracted).not.toBeNull()
    expect(extracted?.content).toContain('BaselineTask')
    expect(extracted?.content).toContain('FocusedTask')
    expect(extracted?.content).not.toContain('OldHistory')
  })

  it('filters directory logs by keywords and time boundaries when focus is provided', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-node-input-'))
    tempRoots.push(root)
    const debugDir = path.join(root, 'debug')
    await mkdir(debugDir, { recursive: true })

    await writeFile(path.join(debugDir, 'maa.bak.20260415.log'), `${makeTimestampedLine('2026-04-15 09:00:00.000', 'OldHistory')}\n`)
    await writeFile(path.join(debugDir, 'maa.bak.log'), `${makeTimestampedLine('2026-04-16 14:49:00.000', 'BaselineTask')}\n`)
    await writeFile(path.join(debugDir, 'maa.log'), `${makeTimestampedLine('2026-04-16 14:55:00.000', 'AutoCollectStart')}\n`)

    const extracted = await loadNodeLogDirectory(root, {
      focus: {
        keywords: ['AutoCollectStart'],
        started_after: '2026-04-16 14:50:00',
      },
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.content).toContain('AutoCollectStart')
    expect(extracted?.content).not.toContain('BaselineTask')
    expect(extracted?.content).not.toContain('OldHistory')
  })

  it('filters zip logs by the same focus selectors', () => {
    const zipData = zipSync({
      'debug/maa.bak.20260415.log': strToU8(`${makeTimestampedLine('2026-04-15 09:00:00.000', 'OldHistory')}\n`),
      'debug/maa.log': strToU8(`${makeTimestampedLine('2026-04-16 14:55:00.000', 'AutoCollectStart')}\n`),
      'debug/notes.txt': strToU8('extra text file\n'),
    })

    const extracted = extractZipContentFromNodeBuffer(zipData, 'logs.zip', {
      focus: {
        keywords: ['AutoCollectStart'],
        started_after: '2026-04-16 14:50:00',
      },
    })

    expect(extracted).not.toBeNull()
    expect(extracted?.content).toContain('AutoCollectStart')
    expect(extracted?.content).not.toContain('OldHistory')
    expect(extracted?.textFiles.map((file) => file.name)).toContain('notes.txt')
  })
})
