import { computed } from 'vue'
import type { UseAppPresentationBindingsOptions } from './types'

interface UsePresentationMainContentBindingsOptions {
  viewMode: UseAppPresentationBindingsOptions['viewMode']
  isMobile: UseAppPresentationBindingsOptions['isMobile']
  splitSize: UseAppPresentationBindingsOptions['splitSize']
  splitVerticalSize: UseAppPresentationBindingsOptions['splitVerticalSize']
  showTaskDrawer: UseAppPresentationBindingsOptions['showTaskDrawer']
  showDetailDrawer: UseAppPresentationBindingsOptions['showDetailDrawer']
  filteredTasks: UseAppPresentationBindingsOptions['filteredTasks']
  tasks: UseAppPresentationBindingsOptions['tasks']
  selectedTask: UseAppPresentationBindingsOptions['selectedTask']
  selectedNode: UseAppPresentationBindingsOptions['selectedNode']
  selectedFlowItemId: UseAppPresentationBindingsOptions['selectedFlowItemId']
  pendingScrollNodeId: UseAppPresentationBindingsOptions['pendingScrollNodeId']
  parser: UseAppPresentationBindingsOptions['parser']
  textSearchViewProps: UseAppPresentationBindingsOptions['textSearchViewProps']
  processViewMobileProps: UseAppPresentationBindingsOptions['processViewMobileProps']
  processViewDesktopProps: UseAppPresentationBindingsOptions['processViewDesktopProps']
  processViewEventHandlers: UseAppPresentationBindingsOptions['processViewEventHandlers']
  detailViewProps: UseAppPresentationBindingsOptions['detailViewProps']
  onSelectTask: UseAppPresentationBindingsOptions['onSelectTask']
  onUploadFile: UseAppPresentationBindingsOptions['onUploadFile']
  onUploadContent: UseAppPresentationBindingsOptions['onUploadContent']
  onMobileTaskSelect: UseAppPresentationBindingsOptions['onMobileTaskSelect']
  onToggleDetailView: UseAppPresentationBindingsOptions['onToggleDetailView']
}

export const usePresentationMainContentBindings = (options: UsePresentationMainContentBindingsOptions) => {
  const handleNavigateToNode = (
    task: NonNullable<UseAppPresentationBindingsOptions['selectedTask']['value']>,
    node: NonNullable<UseAppPresentationBindingsOptions['selectedNode']['value']>,
  ) => {
    options.selectedTask.value = task
    options.selectedNode.value = node
    options.selectedFlowItemId.value = null
    options.pendingScrollNodeId.value = node.node_id
    options.viewMode.value = 'analysis'
  }

  const mainContentProps = computed(() => ({
    viewMode: options.viewMode.value,
    isMobile: options.isMobile.value,
    splitSize: options.splitSize.value,
    splitVerticalSize: options.splitVerticalSize.value,
    showTaskDrawer: options.showTaskDrawer.value,
    showDetailDrawer: options.showDetailDrawer.value,
    filteredTasks: options.filteredTasks.value,
    tasks: options.tasks.value,
    selectedTask: options.selectedTask.value,
    selectedNode: options.selectedNode.value,
    selectedFlowItemId: options.selectedFlowItemId.value,
    parser: options.parser,
    textSearchViewProps: options.textSearchViewProps.value,
    processViewMobileProps: options.processViewMobileProps.value,
    processViewDesktopProps: options.processViewDesktopProps.value,
    processViewEventHandlers: options.processViewEventHandlers,
    detailViewProps: options.detailViewProps.value,
    onSelectTask: options.onSelectTask,
    onNavigateToNode: handleNavigateToNode,
    onUploadFile: options.onUploadFile,
    onUploadContent: options.onUploadContent,
    onMobileTaskSelect: options.onMobileTaskSelect,
    onToggleDetailView: options.onToggleDetailView,
  }))

  const mainContentEventHandlers = {
    'update:split-size': (value: number) => { options.splitSize.value = value },
    'update:split-vertical-size': (value: number) => { options.splitVerticalSize.value = value },
    'update:show-task-drawer': (value: boolean) => { options.showTaskDrawer.value = value },
    'update:show-detail-drawer': (value: boolean) => { options.showDetailDrawer.value = value },
  }

  return {
    mainContentProps,
    mainContentEventHandlers,
  }
}
