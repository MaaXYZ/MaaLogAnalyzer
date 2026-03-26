import type { Ref } from 'vue'
import type { LoadedTextFile } from '../../utils/fileLoadingHelpers'

export interface UseProcessFileLoaderOptions {
  isInTauri: Ref<boolean>
  isInVSCode: Ref<boolean>
  onUploadFile: (file: File) => void
  onUploadContent: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
  ) => void
  onFileLoadingStart: () => void
  onFileLoadingEnd: () => void
}
