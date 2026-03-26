import { ref } from 'vue'
import { isTauri } from '../../../utils/platform'

const isMainLogFileName = (name: string) => name === 'maa.log' || name === 'maafw.log'
const isBakLogFileName = (name: string) => name === 'maa.bak.log' || name === 'maafw.bak.log'

interface UseFlowchartUploadOptions {
  onUploadFile: (file: File) => void
  onUploadContent: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>
  ) => void
}

export const useFlowchartUpload = ({
  onUploadFile,
  onUploadContent,
}: UseFlowchartUploadOptions) => {
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const folderInputRef = ref<HTMLInputElement | null>(null)

  const uploadOptions = [
    { label: '选择文件', key: 'file' },
    { label: '选择文件夹', key: 'folder' },
  ]

  function emitUploadContent(
    content: string,
    errorImages: Map<string, string>,
    visionImages: Map<string, string>,
    waitFreezesImages: Map<string, string>,
  ) {
    onUploadContent(
      content,
      errorImages.size > 0 ? errorImages : undefined,
      visionImages.size > 0 ? visionImages : undefined,
      waitFreezesImages.size > 0 ? waitFreezesImages : undefined,
    )
  }

  function handleUploadSelect(key: string) {
    if (isTauri()) {
      void handleTauriOpen(key)
    } else if (key === 'file') {
      fileInputRef.value?.click()
    } else {
      folderInputRef.value?.click()
    }
  }

  async function handleTauriOpen(key: string) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      if (key === 'file') {
        const selected = await open({
          multiple: false,
          filters: [{ name: 'Log Files', extensions: ['log', 'jsonl', 'txt', 'zip'] }],
          directory: false,
          title: '选择日志文件',
        })
        if (!selected) return
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const path = typeof selected === 'string' ? selected : (selected as any).path
        if (path.toLowerCase().endsWith('.zip')) {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const bytes = await readFile(path)
          onUploadFile(new File([bytes], path.split(/[/\\]/).pop() || 'file.zip'))
        } else {
          const content = await readTextFile(path)
          onUploadContent(content)
        }
      } else {
        const selected = await open({ directory: true, title: '选择日志文件夹' })
        if (!selected) return
        const dirPath = typeof selected === 'string' ? selected : (selected as any).path
        const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
        const entries = await readDir(dirPath)

        let content = ''
        const errorImages = new Map<string, string>()
        const visionImages = new Map<string, string>()
        const waitFreezesImages = new Map<string, string>()
        for (const entry of entries) {
          const name = entry.name?.toLowerCase() || ''
          const fullPath = `${dirPath}/${entry.name}`
          if (isBakLogFileName(name)) {
            content = await readTextFile(fullPath) + '\n' + content
          } else if (isMainLogFileName(name)) {
            content += await readTextFile(fullPath)
          } else if (name.endsWith('.png') || name.endsWith('.jpg')) {
            const baseName = entry.name!.replace(/\.(png|jpg)$/i, '')
            if (baseName.endsWith('_wait_freezes')) {
              waitFreezesImages.set(baseName, fullPath)
            } else if (baseName.includes('_vision_')) {
              visionImages.set(baseName, fullPath)
            } else {
              errorImages.set(baseName, fullPath)
            }
          }
        }
        if (content) {
          emitUploadContent(content, errorImages, visionImages, waitFreezesImages)
        }
      }
    } catch (error) {
      console.error('Tauri open failed:', error)
    }
  }

  function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) onUploadFile(file)
    input.value = ''
  }

  async function handleFolderInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    let bakContent = ''
    let mainContent = ''
    const errorImages = new Map<string, string>()
    const visionImages = new Map<string, string>()
    const waitFreezesImages = new Map<string, string>()

    for (const file of files) {
      const name = file.name.toLowerCase()
      if (isBakLogFileName(name)) {
        bakContent = await file.text()
      } else if (isMainLogFileName(name)) {
        mainContent = await file.text()
      } else if (name.endsWith('.png') || name.endsWith('.jpg')) {
        const baseName = file.name.replace(/\.(png|jpg)$/i, '')
        const url = URL.createObjectURL(file)
        if (baseName.endsWith('_wait_freezes')) {
          waitFreezesImages.set(baseName, url)
        } else if (baseName.includes('_vision_')) {
          visionImages.set(baseName, url)
        } else {
          errorImages.set(baseName, url)
        }
      }
    }

    let content = ''
    if (bakContent) content += bakContent
    if (mainContent) {
      if (content && !content.endsWith('\n')) content += '\n'
      content += mainContent
    }

    if (content) {
      emitUploadContent(content, errorImages, visionImages, waitFreezesImages)
    }
    input.value = ''
  }

  return {
    fileInputRef,
    folderInputRef,
    uploadOptions,
    handleUploadSelect,
    handleFileInputChange,
    handleFolderInputChange,
  }
}
