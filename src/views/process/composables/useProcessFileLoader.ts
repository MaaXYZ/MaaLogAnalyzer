import { h, ref } from 'vue'
import { FileOutlined, FolderOutlined } from '@vicons/antd'
import type { UseProcessFileLoaderOptions } from './fileLoader/types'
import { useWebFileInputs } from './fileLoader/useWebFileInputs'
import { useVSCodeBridge } from './fileLoader/useVSCodeBridge'
import { useTauriBridge } from './fileLoader/useTauriBridge'

export const useProcessFileLoader = (options: UseProcessFileLoaderOptions) => {
  const fileLoading = ref(false)
  const setFileLoading = (loading: boolean) => {
    fileLoading.value = loading
  }

  const {
    folderInputRef,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleFolderChange,
    handleFileInputChange,
    triggerFolderSelect,
    triggerFileSelect,
  } = useWebFileInputs(options, setFileLoading)

  const {
    handleVSCodeOpen,
    handleVSCodeOpenFolder,
  } = useVSCodeBridge(options, () => options.isInVSCode.value)

  const {
    handleTauriOpen,
    handleTauriOpenFolder,
  } = useTauriBridge(options, setFileLoading)

  const reloadOptions = [
    {
      label: '选择文件',
      key: 'file',
      icon: () => h(FileOutlined),
    },
    {
      label: '选择文件夹',
      key: 'folder',
      icon: () => h(FolderOutlined),
    },
  ]

  const handleReloadSelect = (key: string) => {
    if (options.isInTauri.value) {
      if (key === 'file') {
        void handleTauriOpen()
      } else if (key === 'folder') {
        void handleTauriOpenFolder()
      }
      return
    }

    if (options.isInVSCode.value) {
      if (key === 'file') {
        handleVSCodeOpen()
      } else if (key === 'folder') {
        handleVSCodeOpenFolder()
      }
      return
    }

    if (key === 'file') {
      triggerFileSelect()
    } else if (key === 'folder') {
      triggerFolderSelect()
    }
  }

  return {
    fileLoading,
    folderInputRef,
    fileInputRef,
    reloadOptions,
    handleDrop,
    handleDragOver,
    handleFolderChange,
    triggerFolderSelect,
    triggerFileSelect,
    handleFileInputChange,
    handleReloadSelect,
    handleTauriOpen,
    handleTauriOpenFolder,
    handleVSCodeOpen,
    handleVSCodeOpenFolder,
  }
}
