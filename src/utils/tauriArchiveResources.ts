import { invoke } from '@tauri-apps/api/core'

export interface TauriArchiveResourceOwner {
  replace: (token?: string | null) => Promise<void>
  release: () => Promise<void>
  dispose: () => Promise<void>
}

export const releaseTauriArchiveResource = async (token?: string | null): Promise<void> => {
  if (!token) return
  await invoke('release_archive_resource', { token })
}

export const createTauriArchiveResourceOwner = (): TauriArchiveResourceOwner => {
  let currentToken: string | null = null
  let disposed = false
  const pendingReleaseTokens = new Set<string>()
  let releaseTail: Promise<void> = Promise.resolve()

  const releaseOwnedToken = async (token: string | null): Promise<void> => {
    if (token) pendingReleaseTokens.add(token)
    for (const pendingToken of [...pendingReleaseTokens]) {
      try {
        await releaseTauriArchiveResource(pendingToken)
        pendingReleaseTokens.delete(pendingToken)
      } catch (error) {
        console.warn('Failed to release Tauri archive resource:', error)
      }
    }
  }

  const replace = async (token?: string | null): Promise<void> => {
    const nextToken = token ?? null
    if (disposed) {
      releaseTail = releaseTail.then(() => releaseOwnedToken(nextToken))
      await releaseTail
      return
    }
    if (nextToken === currentToken) return
    const previousToken = currentToken
    currentToken = nextToken
    releaseTail = releaseTail.then(() => releaseOwnedToken(previousToken))
    await releaseTail
  }

  const release = async (): Promise<void> => {
    await replace(null)
  }

  const dispose = async (): Promise<void> => {
    if (disposed) {
      await releaseTail
      return
    }
    disposed = true
    const previousToken = currentToken
    currentToken = null
    releaseTail = releaseTail.then(() => releaseOwnedToken(previousToken))
    await releaseTail
  }

  return { replace, release, dispose }
}
