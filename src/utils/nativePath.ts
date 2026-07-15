const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:[\\/]/
const WINDOWS_UNC_PATH = /^(?:\\\\|\/\/)/

const usesWindowsSeparator = (path: string): boolean => (
  WINDOWS_DRIVE_PATH.test(path)
  || WINDOWS_UNC_PATH.test(path)
  || (path.includes('\\') && !path.includes('/'))
)

/**
 * Join paths returned by the native file dialog without assuming the host OS.
 *
 * Tauri returns platform-native absolute paths. Detecting the separator from
 * the selected base path keeps this helper synchronous and avoids one IPC call
 * per directory entry while recursively scanning large debug folders.
 */
export const joinNativePath = (basePath: string, ...segments: string[]): string => {
  const separator = usesWindowsSeparator(basePath) ? '\\' : '/'
  const trimmedBase = basePath.replace(/[\\/]+$/, '')
  const normalizedBase = trimmedBase || (basePath.startsWith('/') ? '/' : basePath)
  const normalizedSegments = segments
    .map(segment => segment.replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter(Boolean)

  if (normalizedSegments.length === 0) return normalizedBase
  if (normalizedBase === '/') return `/${normalizedSegments.join('/')}`
  return `${normalizedBase}${separator}${normalizedSegments.join(separator)}`
}
