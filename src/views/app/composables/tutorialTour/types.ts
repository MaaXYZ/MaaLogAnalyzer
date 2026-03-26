import type { Ref } from 'vue'

export interface TourStepLike {
  id: string
  target: string
  mobileTarget?: string
  sectionId: string
  sectionTitle: string
  padding?: number
  optional?: boolean
  view?: string
}

export interface TourRect {
  top: number
  left: number
  width: number
  height: number
}

export interface UseTutorialTourOptions {
  steps: TourStepLike[]
  isMobile: Ref<boolean>
  viewMode: Ref<string>
  showAboutModal: Ref<boolean>
}
