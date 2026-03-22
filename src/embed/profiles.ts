import { EMBED_MODE_VSCODE_LAUNCH, type EmbedMode } from '../utils/embedMode'

export const STANDALONE_EMBED_MODE = 'standalone' as const

export type ResolvedEmbedMode = typeof STANDALONE_EMBED_MODE | NonNullable<EmbedMode>

export interface EmbedUiProfile {
  autoStartTutorial: boolean
  showHeader: boolean
  showSettings: boolean
  showAbout: boolean
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
  },
}

export const resolveEmbedProfile = (mode: EmbedMode): EmbedProfile => {
  if (mode === EMBED_MODE_VSCODE_LAUNCH) {
    return VSCODE_LAUNCH_PROFILE
  }
  return STANDALONE_PROFILE
}
