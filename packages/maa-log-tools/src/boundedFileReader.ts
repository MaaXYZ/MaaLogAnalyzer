import { lstat, open, type FileHandle } from 'node:fs/promises'
import type { Stats } from 'node:fs'

export type InputFileErrorCode =
  | 'symlink'
  | 'not-regular-file'
  | 'not-directory'
  | 'path-escape'
  | 'identity-changed'
  | 'content-changed'
  | 'size-changed'

export class InputFileError extends Error {
  readonly name = 'InputFileError'

  constructor(
    readonly code: InputFileErrorCode,
    readonly filePath: string,
    message: string,
  ) {
    super(message)
  }
}

export interface FileIdentity {
  dev: number
  ino: number
}

export interface BoundedFileReadProgress {
  handle: FileHandle
  bytesRead: number
  chunkCount: number
}

export interface BoundedFileReadOptions {
  expectedIdentity?: Readonly<FileIdentity>
  onChunkRead?: (progress: BoundedFileReadProgress) => void | Promise<void>
}

const READ_CHUNK_BYTES = 64 * 1024

export const getFileIdentity = (stats: Stats): FileIdentity => ({
  dev: stats.dev,
  ino: stats.ino,
})

export const sameFileIdentity = (
  left: Readonly<FileIdentity>,
  right: Readonly<FileIdentity>,
): boolean => left.dev === right.dev && left.ino === right.ino

const assertRegularPath = (filePath: string, stats: Stats): void => {
  if (stats.isSymbolicLink()) {
    throw new InputFileError(
      'symlink',
      filePath,
      `Symbolic-link inputs are not allowed: ${filePath}`,
    )
  }
  if (!stats.isFile()) {
    throw new InputFileError('not-regular-file', filePath, `Expected a regular file: ${filePath}`)
  }
}

const assertHandleIdentity = (
  filePath: string,
  expected: Readonly<FileIdentity>,
  actual: Stats,
): void => {
  if (!actual.isFile() || !sameFileIdentity(expected, getFileIdentity(actual))) {
    throw new InputFileError(
      'identity-changed',
      filePath,
      `File identity changed while opening or reading: ${filePath}`,
    )
  }
}

const assertStableContentState = (filePath: string, expected: Stats, actual: Stats): void => {
  if (
    expected.size !== actual.size ||
    expected.mtimeMs !== actual.mtimeMs ||
    expected.ctimeMs !== actual.ctimeMs
  ) {
    throw new InputFileError(
      'content-changed',
      filePath,
      `File content or metadata changed while opening or reading: ${filePath}`,
    )
  }
}

export const readBoundedRegularFile = async (
  filePath: string,
  maxBytes: number,
  createLimitError: (actualBytes: number) => Error,
  options: BoundedFileReadOptions = {},
): Promise<Uint8Array> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('Maximum file read size must be a non-negative safe integer')
  }

  const beforeOpen = await lstat(filePath)
  assertRegularPath(filePath, beforeOpen)
  const beforeIdentity = getFileIdentity(beforeOpen)
  if (options.expectedIdentity && !sameFileIdentity(options.expectedIdentity, beforeIdentity)) {
    throw new InputFileError(
      'identity-changed',
      filePath,
      `File identity changed after directory discovery: ${filePath}`,
    )
  }

  const handle = await open(filePath, 'r')
  try {
    const opened = await handle.stat()
    assertHandleIdentity(filePath, beforeIdentity, opened)
    assertStableContentState(filePath, beforeOpen, opened)
    const afterOpen = await lstat(filePath)
    assertRegularPath(filePath, afterOpen)
    assertHandleIdentity(filePath, beforeIdentity, afterOpen)
    assertStableContentState(filePath, opened, afterOpen)

    if (opened.size > maxBytes) throw createLimitError(opened.size)

    const chunks: Uint8Array[] = []
    let totalBytes = 0
    let chunkCount = 0
    while (totalBytes <= maxBytes) {
      const remaining = maxBytes + 1 - totalBytes
      if (remaining <= 0) break
      const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remaining))
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, totalBytes)
      if (bytesRead === 0) break

      totalBytes += bytesRead
      chunkCount += 1
      if (totalBytes > maxBytes) throw createLimitError(totalBytes)
      chunks.push(buffer.subarray(0, bytesRead))
      await options.onChunkRead?.({ handle, bytesRead: totalBytes, chunkCount })
    }

    const finalHandleStats = await handle.stat()
    assertHandleIdentity(filePath, beforeIdentity, finalHandleStats)
    const finalPathStats = await lstat(filePath)
    assertRegularPath(filePath, finalPathStats)
    assertHandleIdentity(filePath, beforeIdentity, finalPathStats)
    assertStableContentState(filePath, opened, finalHandleStats)
    assertStableContentState(filePath, opened, finalPathStats)
    if (finalHandleStats.size !== totalBytes) {
      throw new InputFileError(
        'size-changed',
        filePath,
        `File size changed after the bounded read completed: ${filePath}`,
      )
    }

    const output = new Uint8Array(totalBytes)
    let outputOffset = 0
    for (const chunk of chunks) {
      output.set(chunk, outputOffset)
      outputOffset += chunk.byteLength
    }
    return output
  } finally {
    await handle.close()
  }
}
