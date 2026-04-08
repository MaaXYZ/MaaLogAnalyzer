function toImageSecondsKey(timestamp: string): string {
  return timestamp.replace(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/,
    '$1.$2.$3-$4.$5.$6'
  )
}

export function findImageByTimestampSuffix(
  source: Map<string, string>,
  timestamp: string,
  suffix: string
): string | undefined {
  if (source.size === 0) return undefined
  const secondsKey = toImageSecondsKey(timestamp)
  for (const [key, path] of source.entries()) {
    if (key.includes(`${secondsKey}.`) && key.endsWith(suffix)) {
      return path
    }
  }
  return undefined
}

export function findWaitFreezesImages(
  waitFreezesImages: Map<string, string>,
  nodeTimestamp: string,
  actionName: string
): string[] | undefined {
  if (waitFreezesImages.size === 0) return undefined

  const suffix = `_${actionName}_wait_freezes`
  const results: string[] = []

  const nodeTime = new Date(nodeTimestamp).getTime()
  if (isNaN(nodeTime)) return undefined

  for (const [key, path] of waitFreezesImages.entries()) {
    if (!key.endsWith(suffix)) continue

    const tsMatch = key.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d{1,3})_/)
    if (!tsMatch) continue
    const [, y, mo, d, h, mi, s, ms] = tsMatch
    const imgTime = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.${ms.padEnd(3, '0')}`).getTime()

    if (!isNaN(imgTime) && imgTime <= nodeTime && nodeTime - imgTime < 60000) {
      results.push(path)
    }
  }

  return results.length > 0 ? results : undefined
}
