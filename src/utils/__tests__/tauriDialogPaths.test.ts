import { describe, expect, it } from 'vitest'
import { normalizeTauriDialogPaths } from '../fileDialog'

describe('normalizeTauriDialogPaths', () => {
  it('keeps a single selected path compatible', () => {
    expect(normalizeTauriDialogPaths('C:\\logs\\maa.zip')).toEqual(['C:\\logs\\maa.zip'])
  })

  it('preserves every explicitly selected volume in dialog order', () => {
    expect(
      normalizeTauriDialogPaths(['C:\\logs\\bundle-part02.zip', 'C:\\logs\\bundle-part01.zip']),
    ).toEqual(['C:\\logs\\bundle-part02.zip', 'C:\\logs\\bundle-part01.zip'])
  })

  it('drops invalid empty selections', () => {
    expect(normalizeTauriDialogPaths(null)).toEqual([])
    expect(normalizeTauriDialogPaths(['', 'C:\\logs\\maa.zip'])).toEqual(['C:\\logs\\maa.zip'])
  })
})
