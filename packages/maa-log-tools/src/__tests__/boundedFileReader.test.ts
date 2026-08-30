import { appendFile, mkdtemp, open, rename, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveLimitError } from '../archiveLimits'
import { InputFileError, readBoundedRegularFile } from '../boundedFileReader'

const tempRoots: string[] = []

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

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mla-bounded-reader-'))
  tempRoots.push(root)
  return root
}

describe('bounded regular-file reader', () => {
  it('detects real file growth using max-plus-one bounded reads', async () => {
    const root = await makeTempRoot()
    const filePath = path.join(root, 'maa.log')
    await writeFile(filePath, new Uint8Array(70 * 1024))
    let appended = false

    await expect(
      readBoundedRegularFile(
        filePath,
        75 * 1024,
        (actual) => new ArchiveLimitError('file-size', actual, 75 * 1024),
        {
          onChunkRead: async () => {
            if (appended) return
            appended = true
            await appendFile(filePath, new Uint8Array(10 * 1024))
          },
        },
      ),
    ).rejects.toMatchObject({
      name: 'ArchiveLimitError',
      code: 'file-size',
    })
  })

  it('detects an injected path identity swap while retaining the opened handle', async () => {
    const root = await makeTempRoot()
    const filePath = path.join(root, 'maa.log')
    const movedPath = path.join(root, 'original.log')
    await writeFile(filePath, new Uint8Array(70 * 1024))
    let swapped = false

    await expect(
      readBoundedRegularFile(
        filePath,
        128 * 1024,
        (actual) => new ArchiveLimitError('file-size', actual, 128 * 1024),
        {
          onChunkRead: async () => {
            if (swapped) return
            swapped = true
            await rename(filePath, movedPath)
            await writeFile(filePath, 'replacement')
          },
        },
      ),
    ).rejects.toMatchObject({
      name: 'InputFileError',
      code: 'identity-changed',
    })
  })

  it('rejects in-place same-size mutations during a bounded read', async () => {
    const root = await makeTempRoot()
    const filePath = path.join(root, 'maa.log')
    await writeFile(filePath, new Uint8Array(128 * 1024))
    let mutated = false

    await expect(
      readBoundedRegularFile(
        filePath,
        128 * 1024,
        (actual) => new ArchiveLimitError('file-size', actual, 128 * 1024),
        {
          onChunkRead: async () => {
            if (mutated) return
            mutated = true
            const writer = await open(filePath, 'r+')
            try {
              await writer.write(new Uint8Array([1]), 0, 1, 70 * 1024)
            } finally {
              await writer.close()
            }
            const changedTime = new Date('2000-01-01T00:00:00.000Z')
            await utimes(filePath, changedTime, changedTime)
          },
        },
      ),
    ).rejects.toMatchObject({
      name: 'InputFileError',
      code: 'content-changed',
    })
  })

  it('rejects symbolic-link file inputs', async () => {
    const root = await makeTempRoot()
    const targetPath = path.join(root, 'target.log')
    const linkPath = path.join(root, 'maa.log')
    await writeFile(targetPath, 'main')
    try {
      await symlink(targetPath, linkPath, 'file')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return
      throw error
    }

    await expect(
      readBoundedRegularFile(
        linkPath,
        1024,
        (actual) => new ArchiveLimitError('file-size', actual, 1024),
      ),
    ).rejects.toBeInstanceOf(InputFileError)
  })
})
