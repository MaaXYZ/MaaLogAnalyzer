import type { FileSystem } from '7z-wasm'
import { describe, expect, it } from 'vitest'
import { resolveArchiveLimits } from '../archiveLimits'
import { extractArchiveContent } from '../archiveExtractor'
import {
  ensureSevenZipModule,
  extractSevenZipEntries,
  parseSevenZipListing,
  SevenZipArchiveError,
} from '../sevenZipExtractor'

const listing = (...records: ReadonlyArray<Readonly<Record<string, string>>>): string[] => [
  '7-Zip listing',
  '----------',
  ...records.flatMap(record => [
    ...Object.entries(record).map(([key, value]) => `${key} = ${value}`),
    '',
  ]),
]

const removeVirtualTree = (fileSystem: FileSystem, targetPath: string): void => {
  let stat
  try {
    stat = fileSystem.lstat(targetPath)
  } catch {
    return
  }
  if (!fileSystem.isDir(stat.mode) || fileSystem.isLink(stat.mode)) {
    fileSystem.unlink(targetPath)
    return
  }
  for (const name of fileSystem.readdir(targetPath)) {
    if (name === '.' || name === '..') continue
    removeVirtualTree(fileSystem, `${targetPath}/${name}`)
  }
  fileSystem.rmdir(targetPath)
}

let fixtureSequence = 0

const createSevenZipFixture = async (): Promise<File> => {
  const module = await ensureSevenZipModule()
  if (!module) throw new Error('7z-wasm did not initialize')
  const fixtureId = ++fixtureSequence
  const fixtureRoot = `/tmp/maa-seven-zip-test-${fixtureId}`
  const sourceRoot = `${fixtureRoot}/source`
  const archivePath = `${fixtureRoot}/logs.7z`
  const previousDirectory = module.FS.cwd()

  try {
    module.FS.mkdir(fixtureRoot)
    module.FS.mkdir(sourceRoot)
    module.FS.mkdir(`${sourceRoot}/debug`)
    module.FS.writeFile(`${sourceRoot}/debug/maa.log`, new TextEncoder().encode('main\n'))
    module.FS.writeFile(`${sourceRoot}/@notes.txt`, new TextEncoder().encode('notes\n'))
    module.FS.chdir(sourceRoot)
    const status = (module.callMain as unknown as (args: string[]) => number)([
      'a',
      '-t7z',
      '-mx=1',
      '-spd',
      archivePath,
      '-i!debug/maa.log',
      '-i!@notes.txt',
    ])
    expect(status).toBe(0)
    const bytes = new Uint8Array(module.FS.readFile(archivePath))
    return new File([bytes.buffer], 'logs.7z', { type: 'application/x-7z-compressed' })
  } finally {
    module.FS.chdir(previousDirectory)
    removeVirtualTree(module.FS, fixtureRoot)
  }
}

describe('7z/RAR archive extraction safety', () => {
  it('parses canonical unencrypted entries and rejects aliases or special records', () => {
    const limits = resolveArchiveLimits()
    const entries = parseSevenZipListing(listing({
      Path: 'debug/maa.log',
      Size: '5',
      'Packed Size': '4',
      Attributes: 'A',
      Encrypted: '-',
      Block: '0',
    }), limits)
    expect(entries).toMatchObject([{
      path: 'debug/maa.log',
      size: 5,
      packedSize: 4,
      block: '0',
      isDirectory: false,
    }])

    expect(() => parseSevenZipListing(listing(
      { Path: 'maa.log', Size: '1' },
      { Path: 'MAA.LOG', Size: '1' },
    ), limits)).toThrow(SevenZipArchiveError)
    expect(() => parseSevenZipListing(listing({
      Path: 'debug/maa.log.',
      Size: '1',
    }), limits)).toThrow(SevenZipArchiveError)
    expect(() => parseSevenZipListing(listing({
      Path: 'maa.log',
      Size: '1',
      Anti: '+',
    }), limits)).toThrow(SevenZipArchiveError)
  })

  it('selectively extracts a real 7z file and applies selected output limits', async () => {
    const file = await createSevenZipFixture()
    const extracted = await extractSevenZipEntries(file, async entries => (
      entries.filter(entry => !entry.isDirectory).map(entry => entry.path)
    ))
    expect(new TextDecoder().decode(extracted?.get('debug/maa.log'))).toBe('main\n')
    expect(new TextDecoder().decode(extracted?.get('@notes.txt'))).toBe('notes\n')

    const archiveResult = await extractArchiveContent(file)
    expect(archiveResult?.primaryLogFiles).toMatchObject([{
      path: 'debug/maa.log',
      name: 'maa.log',
      content: 'main\n',
    }])

    await expect(extractSevenZipEntries(file, async entries => (
      entries.filter(entry => !entry.isDirectory).map(entry => entry.path)
    ), {
      archiveLimits: { maxFileBytes: 4 },
    })).rejects.toMatchObject({
      name: 'ArchiveLimitError',
      code: 'file-size',
    })
  })
})
