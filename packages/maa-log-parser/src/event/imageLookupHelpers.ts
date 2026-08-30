interface ImageTimestamp {
  secondsKey: string
  milliseconds: number
}

function parseEventTimestamp(timestamp: string): ImageTimestamp | undefined {
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/)
  if (!match) return undefined

  const [, year, month, day, hour, minute, second, milliseconds = '0'] = match
  return {
    secondsKey: `${year}.${month}.${day}-${hour}.${minute}.${second}`,
    milliseconds: Number(milliseconds.padEnd(3, '0')),
  }
}

function parseImageTimestamp(key: string): ImageTimestamp | undefined {
  const match = key.match(/^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_/)
  if (!match) return undefined

  return {
    secondsKey: match[1],
    milliseconds: Number(match[2].padEnd(3, '0')),
  }
}

export function findImageByTimestampSuffix(
  source: Map<string, string>,
  timestamp: string,
  suffix: string,
): string | undefined {
  if (source.size === 0) return undefined

  const target = parseEventTimestamp(timestamp)
  if (!target) return undefined

  const exactKey = `${target.secondsKey}.${String(target.milliseconds).padStart(3, '0')}${suffix}`
  const exactMatch = source.get(exactKey)
  if (exactMatch) return exactMatch

  let nearestKey: string | undefined
  let nearestPath: string | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const [key, path] of source.entries()) {
    if (!key.endsWith(suffix)) continue

    const candidate = parseImageTimestamp(key)
    if (!candidate || candidate.secondsKey !== target.secondsKey) continue

    const distance = Math.abs(candidate.milliseconds - target.milliseconds)
    if (
      distance < nearestDistance ||
      (distance === nearestDistance && (nearestKey == null || key < nearestKey))
    ) {
      nearestKey = key
      nearestPath = path
      nearestDistance = distance
    }
  }

  return nearestPath
}

export function findWaitFreezesImages(
  waitFreezesImages: Map<string, string>,
  nodeTimestamp: string,
  actionName: string,
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
