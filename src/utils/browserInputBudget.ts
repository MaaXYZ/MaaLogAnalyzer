import { ArchiveLimitError, DEFAULT_ARCHIVE_LIMITS, type ArchiveLimits } from './archiveLimits'

export const BROWSER_INPUT_MAX_DIRECTORY_DEPTH = 64
const utf8Encoder = new TextEncoder()

export class InputResourceLimitError extends Error {
  readonly name = 'InputResourceLimitError'

  constructor(message: string) {
    super(message)
  }
}

export { InputResourceLimitError as BrowserInputLimitError }

export interface InputResourceBudget {
  readonly limits: Readonly<ArchiveLimits> | null
  totalPathBytes: number
  selectedBytes: number
  readonly registeredPaths: Set<string>
  readonly chargedPaths: Set<string>
}

export interface BrowserInputBudget extends InputResourceBudget {
  readonly registeredFiles: WeakSet<File>
  readonly chargedFiles: WeakSet<File>
}

export const createInputResourceBudget = (
  limits: Readonly<ArchiveLimits> | null = DEFAULT_ARCHIVE_LIMITS,
): InputResourceBudget => ({
  limits,
  totalPathBytes: 0,
  selectedBytes: 0,
  registeredPaths: new Set<string>(),
  chargedPaths: new Set<string>(),
})

export const createBrowserInputBudget = (
  limits: Readonly<ArchiveLimits> | null = DEFAULT_ARCHIVE_LIMITS,
): BrowserInputBudget => ({
  ...createInputResourceBudget(limits),
  registeredFiles: new WeakSet<File>(),
  chargedFiles: new WeakSet<File>(),
})

const assertFileSize = (file: File) => {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new InputResourceLimitError('浏览器返回了无效的文件大小')
  }
}

export const registerInputResourceEntry = (
  budget: InputResourceBudget,
  path: string,
  depth: number,
) => {
  if (!Number.isSafeInteger(depth) || depth < 0 || depth > BROWSER_INPUT_MAX_DIRECTORY_DEPTH) {
    throw new InputResourceLimitError(`目录嵌套层级超过限制 (${BROWSER_INPUT_MAX_DIRECTORY_DEPTH})`)
  }

  const normalizedPath = path.replace(/\\/g, '/')
  if (budget.registeredPaths.has(normalizedPath)) return

  if (!budget.limits) {
    budget.registeredPaths.add(normalizedPath)
    return
  }

  const pathBytes = utf8Encoder.encode(normalizedPath).byteLength
  if (pathBytes > budget.limits.maxPathBytes) {
    throw new ArchiveLimitError('path-size', pathBytes, budget.limits.maxPathBytes)
  }

  const nextTotalPathBytes = budget.totalPathBytes + pathBytes
  if (
    !Number.isSafeInteger(nextTotalPathBytes) ||
    nextTotalPathBytes > budget.limits.maxTotalPathBytes
  ) {
    throw new ArchiveLimitError(
      'total-path-size',
      nextTotalPathBytes,
      budget.limits.maxTotalPathBytes,
    )
  }

  budget.totalPathBytes = nextTotalPathBytes
  budget.registeredPaths.add(normalizedPath)
}

export const registerBrowserInputEntry = registerInputResourceEntry

export const chargeInputResourceBytes = (
  budget: InputResourceBudget,
  size: number,
  options: { image?: boolean } = {},
) => {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new InputResourceLimitError('文件系统返回了无效的文件大小')
  }
  if (!budget.limits) return
  if (size > budget.limits.maxFileBytes) {
    throw new ArchiveLimitError('file-size', size, budget.limits.maxFileBytes)
  }
  if (options.image && size > budget.limits.maxImageBytes) {
    throw new ArchiveLimitError('image-size', size, budget.limits.maxImageBytes)
  }

  const nextSelectedBytes = budget.selectedBytes + size
  if (
    !Number.isSafeInteger(nextSelectedBytes) ||
    nextSelectedBytes > budget.limits.maxExtractedBytes
  ) {
    throw new ArchiveLimitError(
      'extracted-size',
      nextSelectedBytes,
      budget.limits.maxExtractedBytes,
    )
  }
  budget.selectedBytes = nextSelectedBytes
}

export const registerBrowserInputFile = (budget: BrowserInputBudget, file: File, path: string) => {
  if (budget.registeredFiles.has(file)) return
  const depth = path.replace(/\\/g, '/').split('/').filter(Boolean).length - 1
  registerInputResourceEntry(budget, path, Math.max(0, depth))
  budget.registeredFiles.add(file)
}

export const chargeBrowserInputFile = (
  budget: BrowserInputBudget,
  file: File,
  options: { image?: boolean } = {},
) => {
  if (budget.chargedFiles.has(file)) return
  assertFileSize(file)
  chargeInputResourceBytes(budget, file.size, options)
  budget.chargedFiles.add(file)
}
