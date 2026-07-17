import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { decodeFileContent } from '../fileDialog'

describe('decodeFileContent', () => {
  it('decodes UTF-8 content', () => {
    const bytes = new TextEncoder().encode('utf-8 log')
    expect(decodeFileContent(bytes)).toBe('utf-8 log')
  })

  it('falls back to GBK for non-UTF-8 content', () => {
    // GBK bytes for U+6D4B U+8BD5.
    const bytes = new Uint8Array([0xb2, 0xe2, 0xca, 0xd4])
    expect(decodeFileContent(bytes)).toBe('\u6d4b\u8bd5')
  })
})