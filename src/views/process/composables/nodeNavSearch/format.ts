import type { NodeNavMatchDetail, NodeNavMatchKind } from './types'

export const formatNodeNavMatchHint = (kinds: NodeNavMatchKind[]): string => {
  const labels = kinds.map((kind) => {
    if (kind === 'next-list') return 'Next'
    if (kind === 'flow') return '流程'
    return '节点'
  })
  return labels.join('/')
}

const formatNodeNavMatchDetail = (detail: NodeNavMatchDetail): string => {
  if (detail.kind === 'next-list') return `Next: ${detail.text}`
  if (detail.kind === 'flow') return `流程: ${detail.text}`
  return `节点: ${detail.text}`
}

export const formatNodeNavMatchPreview = (details: NodeNavMatchDetail[]): string => {
  if (details.length === 0) return ''
  const shown = details.slice(0, 2).map(formatNodeNavMatchDetail).join('；')
  if (details.length <= 2) return shown
  return `${shown}（共 ${details.length} 处）`
}
