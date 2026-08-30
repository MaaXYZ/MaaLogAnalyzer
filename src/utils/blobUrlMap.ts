export const replaceBlobUrl = (target: Map<string, string>, key: string, source: Blob): string => {
  const nextUrl = URL.createObjectURL(source)
  const previousUrl = target.get(key)
  if (previousUrl && previousUrl !== nextUrl) {
    URL.revokeObjectURL(previousUrl)
  }
  target.set(key, nextUrl)
  return nextUrl
}

export const revokeBlobUrlMap = (target?: Map<string, string> | null): void => {
  if (!target) return
  for (const url of target.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  target.clear()
}
