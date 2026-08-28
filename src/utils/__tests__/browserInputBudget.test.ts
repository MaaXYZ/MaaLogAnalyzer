import { describe, expect, it } from 'vitest'
import { resolveArchiveLimits } from '../archiveLimits'
import {
  BrowserInputLimitError,
  chargeBrowserInputFile,
  chargeInputResourceBytes,
  createBrowserInputBudget,
  createInputResourceBudget,
  registerBrowserInputEntry,
  registerBrowserInputFile,
  registerInputResourceEntry,
} from '../browserInputBudget'
import { collectTextFilesFromFiles } from '../../views/process/utils/fileLoadingHelpers'

describe('browser input resource budgets', () => {
  it('counts each File object once across metadata and selected-byte passes', () => {
    const file = new File(['payload'], 'maa.log')
    const budget = createBrowserInputBudget()

    registerBrowserInputFile(budget, file, 'debug/maa.log')
    registerBrowserInputFile(budget, file, 'debug/maa.log')
    chargeBrowserInputFile(budget, file)
    chargeBrowserInputFile(budget, file)

    expect(budget.registeredPaths.size).toBe(1)
    expect(budget.selectedBytes).toBe(file.size)
  })

  it('rejects excessive directory depth before recursion continues', () => {
    const budget = createBrowserInputBudget()
    expect(() => registerBrowserInputEntry(budget, 'deep/path', 65))
      .toThrow(BrowserInputLimitError)
  })

  it('deduplicates repeated native path scans while sharing byte totals', () => {
    const budget = createInputResourceBudget()
    registerInputResourceEntry(budget, 'C:/logs/debug/maa.log', 2)
    registerInputResourceEntry(budget, 'C:\\logs\\debug\\maa.log', 2)
    chargeInputResourceBytes(budget, 10)
    chargeInputResourceBytes(budget, 20)

    expect(budget.registeredPaths.size).toBe(1)
    expect(budget.selectedBytes).toBe(30)
  })

  it('rejects oversized selected files and aggregate selected bytes', () => {
    const limits = resolveArchiveLimits()
    const oversized = { size: limits.maxFileBytes + 1 } as File
    expect(() => chargeBrowserInputFile(createBrowserInputBudget(), oversized)).toThrow(/file-size/)

    const budget = createBrowserInputBudget()
    budget.selectedBytes = limits.maxExtractedBytes
    expect(() => chargeBrowserInputFile(budget, new File(['x'], 'extra.log'))).toThrow(
      /extracted-size/,
    )
  })

  it('skips path and byte accounting for an explicitly unmetered local input', () => {
    const limits = resolveArchiveLimits()
    const oversized = { size: limits.maxFileBytes + 1 } as File
    const budget = createBrowserInputBudget(null)

    expect(() => chargeBrowserInputFile(createBrowserInputBudget(), oversized)).toThrow(/file-size/)
    expect(() => {
      registerBrowserInputFile(budget, oversized, 'debug/maa.log')
      chargeBrowserInputFile(budget, oversized)
    }).not.toThrow()
    expect(budget.selectedBytes).toBe(0)
    expect(budget.totalPathBytes).toBe(0)
  })

  it('does not preload primary logs a second time as auxiliary text files', async () => {
    const primary = new File(['primary'], 'maa.log')
    const auxiliary = new File(['auxiliary'], 'details.txt')
    const budget = createBrowserInputBudget()

    const files = await collectTextFilesFromFiles([primary, auxiliary], budget)

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      path: 'details.txt',
      name: 'details.txt',
    })
    expect(await files[0].loadContent?.()).toBe('auxiliary')
    expect(budget.selectedBytes).toBe(auxiliary.size)
  })
})
