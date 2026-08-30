export const WINDOWS_CONTEXT_MENU_KEYS = [
  'HKCU\\Software\\Classes\\Directory\\shell\\MaaLogAnalyzer',
  'HKCU\\Software\\Classes\\Directory\\Background\\shell\\MaaLogAnalyzer',
  'HKCU\\Software\\Classes\\SystemFileAssociations\\.log\\shell\\MaaLogAnalyzer',
  'HKCU\\Software\\Classes\\SystemFileAssociations\\.zip\\shell\\MaaLogAnalyzer',
] as const

const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]{0,63}$/

export const normalizeEditorUriScheme = (scheme: string): string =>
  URI_SCHEME_RE.test(scheme) ? scheme : 'vscode'
