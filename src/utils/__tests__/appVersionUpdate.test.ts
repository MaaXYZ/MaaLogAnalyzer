import { describe, expect, it, vi } from 'vitest'

import {
  APP_VERSION_QUERY_KEY,
  parseAppVersionManifest,
  redirectIfEmbeddedAppIsOutdated,
  resolveEmbeddedVersionUpdateUrl,
} from '../appVersionUpdate'

const createLocation = (href: string, replace = vi.fn()) => {
  const url = new URL(href)
  return {
    href: url.toString(),
    origin: url.origin,
    search: url.search,
    replace,
  } as unknown as Pick<Location, 'href' | 'origin' | 'replace' | 'search'>
}

describe('app version manifest', () => {
  it('accepts a non-empty version string', () => {
    expect(parseAppVersionManifest({ version: ' 1.2.3-4-gabc1234 ' })).toBe('1.2.3-4-gabc1234')
  })

  it('rejects malformed manifests', () => {
    expect(parseAppVersionManifest(null)).toBeNull()
    expect(parseAppVersionManifest({ version: 123 })).toBeNull()
    expect(parseAppVersionManifest({ version: ' ' })).toBeNull()
  })
})

describe('embedded app version update URL', () => {
  it('preserves the embed mode and hash while selecting a stable version URL', () => {
    const target = resolveEmbeddedVersionUpdateUrl(
      '1.0.0',
      '1.1.0',
      'https://mla.maafw.com/?embed=vscode-panel#task-1',
    )

    const url = new URL(target!)
    expect(url.searchParams.get('embed')).toBe('vscode-panel')
    expect(url.searchParams.get(APP_VERSION_QUERY_KEY)).toBe('1.1.0')
    expect(url.hash).toBe('#task-1')
  })

  it('does not redirect for the current version or repeat the same update', () => {
    expect(resolveEmbeddedVersionUpdateUrl('1.1.0', '1.1.0', 'https://mla.maafw.com/')).toBeNull()
    expect(
      resolveEmbeddedVersionUpdateUrl(
        '1.0.0',
        '1.1.0',
        'https://mla.maafw.com/?embed=vscode-panel&' + APP_VERSION_QUERY_KEY + '=1.1.0',
      ),
    ).toBeNull()
  })
})

describe('embedded app version check', () => {
  it('skips standalone pages without making a request', async () => {
    const fetchMock = vi.fn()
    const replace = vi.fn()

    const redirected = await redirectIfEmbeddedAppIsOutdated('1.0.0', {
      location: createLocation('https://mla.maafw.com/', replace),
      fetchImpl: fetchMock as typeof fetch,
    })

    expect(redirected).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('reloads an embedded page only when the manifest version changes', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => (
      new Response(JSON.stringify({ version: '1.1.0' }))
    ))
    const replace = vi.fn((_url: string) => {})

    const redirected = await redirectIfEmbeddedAppIsOutdated('1.0.0', {
      location: createLocation('https://mla.maafw.com/?embed=vscode-panel', replace),
      fetchImpl: fetchMock as typeof fetch,
    })

    expect(redirected).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://mla.maafw.com/version.json')
    expect(replace).toHaveBeenCalledOnce()
    expect(new URL(replace.mock.calls[0]![0]).searchParams.get(APP_VERSION_QUERY_KEY)).toBe('1.1.0')
  })

  it('falls back to the cached app when the version request fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline')
    })
    const replace = vi.fn()

    const redirected = await redirectIfEmbeddedAppIsOutdated('1.0.0', {
      location: createLocation('https://mla.maafw.com/?embed=vscode-launch', replace),
      fetchImpl: fetchMock as typeof fetch,
    })

    expect(redirected).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})
