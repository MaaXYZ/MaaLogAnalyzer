import { describe, expect, it, vi } from 'vitest'
import { loadViewChunk } from '../asyncView'

describe('loadViewChunk', () => {
  it('首次失败后再试一次，成功则返回结果（覆盖部署后旧 chunk 短暂 404 的情况）', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('HTTP 404 chunk'))
      .mockResolvedValueOnce('ok')

    await expect(loadViewChunk(loader)).resolves.toBe('ok')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('两次都失败时抛出第一次的错误，交给兜底界面展示原因', async () => {
    const first = new Error('404 SearchModePane.js')
    const loader = vi.fn<() => Promise<string>>().mockRejectedValue(first)

    await expect(loadViewChunk(loader)).rejects.toThrow('404 SearchModePane.js')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('一次就成功时不会重试', async () => {
    const loader = vi.fn<() => Promise<string>>().mockResolvedValue('ok')

    await expect(loadViewChunk(loader)).resolves.toBe('ok')
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
