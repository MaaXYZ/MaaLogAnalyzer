import { setupLoadedTargetModeSync } from './watchModeSync'
import { setupLoadedTargetSelectedSync } from './watchSelectedSync'
import { setupLoadedTargetTargetsSync } from './watchTargetsSync'
import type { LoadedSourceSyncOptions } from './optionTypes'

export const setupLoadedTargetSourceSync = (options: LoadedSourceSyncOptions) => {
  setupLoadedTargetTargetsSync(options)
  setupLoadedTargetSelectedSync(options)
  setupLoadedTargetModeSync(options)
}
