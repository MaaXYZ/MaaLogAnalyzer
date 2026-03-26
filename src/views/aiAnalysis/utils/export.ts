const pad2num = (value: number) => String(value).padStart(2, '0')

export const formatExportTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad2num(date.getMonth() + 1)}-${pad2num(date.getDate())} ${pad2num(date.getHours())}:${pad2num(date.getMinutes())}:${pad2num(date.getSeconds())}`
}

export const buildExportStamp = () => {
  const date = new Date()
  return `${date.getFullYear()}${pad2num(date.getMonth() + 1)}${pad2num(date.getDate())}-${pad2num(date.getHours())}${pad2num(date.getMinutes())}${pad2num(date.getSeconds())}`
}

export const sanitizeFilenameSegment = (value: string) => {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').trim()
  if (!normalized) return 'task'
  return normalized.slice(0, 48)
}
