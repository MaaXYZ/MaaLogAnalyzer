export interface BridgeOpenCropRequest {
  cachedImageId?: number | null
  dataUrl?: string | null
  taskId?: number | null
  recoId?: number | null
}

export type FocusSourceKind = 'node' | 'recognition' | 'action'

export interface FocusCardEntry {
  message?: string
  phase?: 'starting' | 'succeeded' | 'failed'
  display: string[]
  resolvedContent: string
}

export interface FocusCardData {
  sourceKind: FocusSourceKind
  entries: FocusCardEntry[]
  rawFocus: unknown
}
