import type { Ref } from 'vue'
import type { LoadedTextFile } from '../../utils/fileLoadingHelpers'
import type { LoadedPrimaryLogFile, PrimaryLogSelectionOption } from '../../../../utils/logFileDiscovery'

export interface UseProcessFileLoaderOptions {
  isInTauri: Ref<boolean>
  isInVSCode: Ref<boolean>
  onUploadFile: (
    file: File | File[],
    selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
  ) => void
  onUploadContent: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: LoadedPrimaryLogFile[],
  ) => void
  onFileLoadingStart: () => void
  onFileLoadingEnd: () => void
  selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>
}
