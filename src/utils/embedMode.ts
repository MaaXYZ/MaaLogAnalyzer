export const EMBED_QUERY_KEY = 'embed'
export const EMBED_MODE_VSCODE_LAUNCH = 'vscode-launch' as const

export type EmbedMode = typeof EMBED_MODE_VSCODE_LAUNCH | null

const normalize = (value: string | null): string => {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

export const parseEmbedMode = (search: string): EmbedMode => {
  const params = new URLSearchParams(search)
  const embed = normalize(params.get(EMBED_QUERY_KEY))
  if (embed === EMBED_MODE_VSCODE_LAUNCH) return EMBED_MODE_VSCODE_LAUNCH
  return null
}
