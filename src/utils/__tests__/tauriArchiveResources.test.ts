import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

import {
  createTauriArchiveResourceOwner,
  releaseTauriArchiveResource,
} from '../tauriArchiveResources'

describe('Tauri archive resource ownership', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
  })

  it('releases replaced and disposed resource tokens exactly once', async () => {
    const owner = createTauriArchiveResourceOwner()
    await owner.replace('resource-1')
    expect(invokeMock).not.toHaveBeenCalled()

    await owner.replace('resource-2')
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'release_archive_resource', {
      token: 'resource-1',
    })

    await owner.release()
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'release_archive_resource', {
      token: 'resource-2',
    })
    await owner.release()
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })

  it('does not invoke the backend for an absent token', async () => {
    await releaseTauriArchiveResource(null)
    await releaseTauriArchiveResource(undefined)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('immediately releases tokens that arrive after disposal', async () => {
    const owner = createTauriArchiveResourceOwner()
    await owner.replace('resource-1')
    await owner.dispose()
    await owner.replace('resource-late')
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'release_archive_resource', {
      token: 'resource-1',
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'release_archive_resource', {
      token: 'resource-late',
    })
  })

  it('keeps ownership transitions usable when cleanup fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    invokeMock.mockRejectedValueOnce(new Error('busy'))
    const owner = createTauriArchiveResourceOwner()
    await owner.replace('resource-1')
    await expect(owner.replace('resource-2')).resolves.toBeUndefined()
    await owner.release()
    expect(
      invokeMock.mock.calls.filter(
        ([, payload]) => (payload as { token?: string }).token === 'resource-1',
      ),
    ).toHaveLength(2)
    expect(invokeMock).toHaveBeenLastCalledWith('release_archive_resource', {
      token: 'resource-2',
    })
    warning.mockRestore()
  })
})
