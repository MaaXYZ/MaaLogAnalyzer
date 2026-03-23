import { EMBED_MODE_VSCODE_LAUNCH, type EmbedMode } from '../utils/embedMode'

export const STANDALONE_EMBED_MODE = 'standalone' as const

export type ResolvedEmbedMode = typeof STANDALONE_EMBED_MODE | NonNullable<EmbedMode>

export interface EmbedUiProfile {
  autoStartTutorial: boolean
  showHeader: boolean
  showSettings: boolean
  showAbout: boolean
  showProcessThreadFilters: boolean
  showRealtimeStatus: boolean
  showReloadControls: boolean
  showTextSearchView: boolean
  showSplitView: boolean
}

export interface EmbedProfile {
  mode: ResolvedEmbedMode
  bridgeEnabled: boolean
  ui: EmbedUiProfile
}

const STANDALONE_PROFILE: EmbedProfile = {
  mode: STANDALONE_EMBED_MODE,
  bridgeEnabled: false,
  ui: {
    autoStartTutorial: true,
    showHeader: true,
    showSettings: true,
    showAbout: true,
    showProcessThreadFilters: true,
    showRealtimeStatus: false,
    showReloadControls: true,
    showTextSearchView: true,
    showSplitView: true,
  },
}

const VSCODE_LAUNCH_PROFILE: EmbedProfile = {
  mode: EMBED_MODE_VSCODE_LAUNCH,
  bridgeEnabled: true,
  ui: {
    autoStartTutorial: false,
    showHeader: true,
    showSettings: true,
    showAbout: true,
    showProcessThreadFilters: false,
    showRealtimeStatus: true,
    showReloadControls: false,
    showTextSearchView: false,
    showSplitView: false,
  },
}

export const resolveEmbedProfile = (mode: EmbedMode): EmbedProfile => {
  if (mode === EMBED_MODE_VSCODE_LAUNCH) {
    return VSCODE_LAUNCH_PROFILE
  }
  return STANDALONE_PROFILE
}
