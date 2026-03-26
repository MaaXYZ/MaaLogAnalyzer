import { parseEmbedMode } from './embedMode'
import { isTauri, isVSCode } from './platform'

const MAX_RETRY = 20
const RETRY_INTERVAL_MS = 500

const getRuntime = (): 'web' | 'web-iframe' | 'tauri-desktop' | 'vscode-webview' => {
  if (isVSCode()) return 'vscode-webview'
  if (isTauri()) return 'tauri-desktop'
  if (typeof window !== 'undefined' && window.self !== window.top) return 'web-iframe'
  return 'web'
}

const normalizeEventSegment = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
)

const buildContextEventName = (runtime: string, embedMode: string): string => {
  const segments = ['client', 'context', normalizeEventSegment(runtime)]
  if (embedMode !== 'none') {
    segments.push('embed', normalizeEventSegment(embedMode))
  }
  return segments.join('_')
}

export const reportAnalyticsContext = (): void => {
  if (typeof window === 'undefined') return

  const runtime = getRuntime()
  const embedMode = parseEmbedMode(window.location.search) ?? 'none'
  const eventName = buildContextEventName(runtime, embedMode)

  const payload = {
    runtime,
    embedMode,
    inIframe: window.self !== window.top,
    path: window.location.pathname,
  }

  let sent = false

  const trySend = (): boolean => {
    if (sent) return true
    const umami = window.umami
    if (!umami) return false

    try {
      if (typeof umami.identify === 'function') {
        umami.identify(payload)
      }
      if (typeof umami.track === 'function') {
        umami.track(eventName, payload)
      }
      sent = true
      return true
    } catch {
      return false
    }
  }

  if (trySend()) return

  let retryCount = 0
  const retryTimer = window.setInterval(() => {
    retryCount += 1
    if (trySend() || retryCount >= MAX_RETRY) {
      window.clearInterval(retryTimer)
    }
  }, RETRY_INTERVAL_MS)

  window.addEventListener(
    'load',
    () => {
      trySend()
    },
    { once: true },
  )
}
