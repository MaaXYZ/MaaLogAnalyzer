import type { Ref } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import { useProcessFileLoader } from '../useProcessFileLoader'
import { useProcessSelectionHandlers } from '../useProcessSelectionHandlers'
import type { ProcessViewControllerEmitters } from './types'

interface UseProcessFileSelectionOptions {
  emitters: ProcessViewControllerEmitters
  isInTauri: Ref<boolean>
  isInVSCode: Ref<boolean>
  virtualScroller: Ref<InstanceType<typeof DynamicScroller> | null>
}

export const useProcessFileSelection = (
  options: UseProcessFileSelectionOptions,
) => {
  const {
    folderInputRef,
    fileInputRef,
    reloadOptions,
    handleDrop,
    handleDragOver,
    handleFolderChange,
    handleFileInputChange,
    handleReloadSelect,
    handleTauriOpen,
    handleTauriOpenFolder,
    handleVSCodeOpen,
    handleVSCodeOpenFolder,
  } = useProcessFileLoader({
    isInTauri: options.isInTauri,
    isInVSCode: options.isInVSCode,
    onUploadFile: options.emitters.onUploadFile,
    onUploadContent: options.emitters.onUploadContent,
    onFileLoadingStart: options.emitters.onFileLoadingStart,
    onFileLoadingEnd: options.emitters.onFileLoadingEnd,
  })

  const {
    handleNodeClick,
    handleActionClick,
    handleRecognitionClick,
    handleFlowItemClick,
    handleVirtualScrollerMounted,
  } = useProcessSelectionHandlers({
    virtualScroller: options.virtualScroller,
    onSelectNode: options.emitters.onSelectNode,
    onSelectAction: options.emitters.onSelectAction,
    onSelectRecognition: options.emitters.onSelectRecognition,
    onSelectFlowItem: options.emitters.onSelectFlowItem,
  })

  return {
    folderInputRef,
    fileInputRef,
    reloadOptions,
    handleDrop,
    handleDragOver,
    handleFolderChange,
    handleFileInputChange,
    handleReloadSelect,
    handleTauriOpen,
    handleTauriOpenFolder,
    handleVSCodeOpen,
    handleVSCodeOpenFolder,
    handleNodeClick,
    handleActionClick,
    handleRecognitionClick,
    handleFlowItemClick,
    handleVirtualScrollerMounted,
  }
}
