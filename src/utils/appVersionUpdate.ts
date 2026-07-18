import { EMBED_MODE_VSCODE_LAUNCH, parseEmbedMode } from './embedMode'

export const APP_VERSION_MANIFEST_PATH = '/version.json'
export const APP_VERSION_QUERY_KEY = '_mla_version'

const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 1500
const MAX_VERSION_LENGTH = 128

type VersionCheckLocation = Pick<Location, 'href' | 'origin' | 'replace' | 'search'>

interface EmbeddedVersionCheckOptions {
  location?: VersionCheckLocation
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const normalizeVersion = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_VERSION_LENGTH) return ''
  return normalized
}

export const parseAppVersionManifest = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null
  return normalizeVersion((value as { version?: unknown }).version) || null
}

export const resolveEmbeddedVersionUpdateUrl = (
  currentVersion: string,
  latestVersion: string,
  href: string,
): string | null => {
  const current = normalizeVersion(currentVersion)
  const latest = normalizeVersion(latestVersion)
  if (!current || !latest || current === latest) return null

  const url = new URL(href)
  if (url.searchParams.get(APP_VERSION_QUERY_KEY) === latest) {
    // The server may still be switching releases. Do not enter a reload loop.
    return null
  }

  url.searchParams.set(APP_VERSION_QUERY_KEY, latest)
  return url.toString()
}

export const redirectIfEmbeddedAppIsOutdated = async (
  currentVersion: string,
  options: EmbeddedVersionCheckOptions = {},
): Promise<boolean> => {
  const location = options.location ?? window.location
  if (parseEmbedMode(location.search) !== EMBED_MODE_VSCODE_LAUNCH) return false

  const controller = new AbortController()
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS)
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const manifestUrl = new URL(APP_VERSION_MANIFEST_PATH, location.origin)

    const fetchImpl = options.fetchImpl ?? window.fetch.bind(window)
    const response = await fetchImpl(manifestUrl, {
      cache: 'no-cache',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    })
    if (!response.ok) return false

    const latestVersion = parseAppVersionManifest(await response.json())
    if (!latestVersion) return false

    const updateUrl = resolveEmbeddedVersionUpdateUrl(currentVersion, latestVersion, location.href)
    if (!updateUrl) return false

    location.replace(updateUrl)
    return true
  } catch {
    // Offline, timeout, and deployments without a manifest all fall back to the cached app.
    return false
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
