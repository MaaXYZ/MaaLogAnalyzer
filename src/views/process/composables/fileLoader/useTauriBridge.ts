import type { UseProcessFileLoaderOptions } from './types'

const createObjectUrlMap = (entries: Record<string, number[]>, mimeType: string) => {
  const result = new Map<string, string>()
  for (const [key, bytes] of Object.entries(entries)) {
    const blob = new Blob([new Uint8Array(bytes)], { type: mimeType })
    result.set(key, URL.createObjectURL(blob))
  }
  return result
}

export const useTauriBridge = (
  options: UseProcessFileLoaderOptions,
  setFileLoading: (loading: boolean) => void,
) => {
  const handleTauriOpen = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Log Files',
          extensions: ['log', 'jsonl', 'txt', 'zip'],
        }],
        directory: false,
        title: '选择日志文件',
      })

      if (selected && typeof selected === 'string') {
        try {
          setFileLoading(true)
          options.onFileLoadingStart()

          if (selected.toLowerCase().endsWith('.zip')) {
            const { invoke } = await import('@tauri-apps/api/core')
            const result = await invoke<{
              content: string
              error_images: Record<string, number[]>
              vision_images: Record<string, number[]>
              wait_freezes_images: Record<string, number[]>
            }>('extract_zip_log', { path: selected })

            const errorImages = createObjectUrlMap(result.error_images, 'image/png')
            const visionImages = createObjectUrlMap(result.vision_images, 'image/jpeg')
            const waitFreezesImages = createObjectUrlMap(result.wait_freezes_images, 'image/jpeg')

            options.onUploadContent(result.content, errorImages, visionImages, waitFreezesImages)
          } else {
            const { readTextFile } = await import('@tauri-apps/plugin-fs')
            const content = await readTextFile(selected)

            if (content) {
              const fileName = selected.split(/[/\\]/).pop() || 'loaded.log'
              options.onUploadContent(
                content,
                undefined,
                undefined,
                undefined,
                [{ path: selected, name: fileName, content }],
              )
            }
          }
        } finally {
          setFileLoading(false)
          options.onFileLoadingEnd()
        }
      }
    } catch (error) {
      setFileLoading(false)
      options.onFileLoadingEnd()
      alert('打开文件失败: ' + error)
    }
  }

  const handleTauriOpenFolder = async () => {
    try {
      const { openFolderDialog } = await import('../../../../utils/fileDialog')

      setFileLoading(true)
      options.onFileLoadingStart()

      const result = await openFolderDialog()
      if (result) {
        options.onUploadContent(
          result.content,
          result.errorImages,
          result.visionImages,
          result.waitFreezesImages,
          result.textFiles,
        )
      }
    } catch (error) {
      alert('打开文件夹失败: ' + error)
    } finally {
      setFileLoading(false)
      options.onFileLoadingEnd()
    }
  }

  return {
    handleTauriOpen,
    handleTauriOpenFolder,
  }
}
