import type { TaskLifecycleMetaEventContext } from './taskLifecycle'

export const createTaskLifecycleMetaContext = (params: {
  rootTaskId: number
  taskStackTracker: {
    peek: () => number
    push: (taskId: number) => void
    pop: (taskId: number) => void
  }
  subTaskParentByTaskId: Map<number, number>
  subTaskSnapshots: Map<number, any>
  getOrCreateSubTaskSnapshot: (snapshots: Map<number, any>, taskId: number) => any
  applySubTaskSnapshotStarting: (
    snapshot: any,
    details: Record<string, any>,
    message: string,
    timestamp: string,
    intern: (value: string) => string
  ) => void
  applySubTaskSnapshotTerminal: (
    snapshot: any,
    details: Record<string, any>,
    message: string,
    timestamp: string,
    phase: any,
    intern: (value: string) => string
  ) => void
  intern: (value: string) => string
}): TaskLifecycleMetaEventContext => {
  return {
    rootTaskId: params.rootTaskId,
    peekActiveTask: () => params.taskStackTracker.peek(),
    pushActiveTask: (taskId) => params.taskStackTracker.push(taskId),
    popActiveTask: (taskId) => params.taskStackTracker.pop(taskId),
    setSubTaskParent: (subTaskId: number, parentTaskId: number) => {
      params.subTaskParentByTaskId.set(subTaskId, parentTaskId)
    },
    onSubTaskStarting: (subTaskId, subTaskDetails, subTaskMessage, subTaskTimestamp) => {
      const snapshot = params.getOrCreateSubTaskSnapshot(params.subTaskSnapshots, subTaskId)
      params.applySubTaskSnapshotStarting(
        snapshot,
        subTaskDetails,
        subTaskMessage,
        subTaskTimestamp,
        params.intern
      )
    },
    onSubTaskTerminal: (subTaskId, subTaskDetails, subTaskMessage, subTaskTimestamp, phase) => {
      const snapshot = params.getOrCreateSubTaskSnapshot(params.subTaskSnapshots, subTaskId)
      params.applySubTaskSnapshotTerminal(
        snapshot,
        subTaskDetails,
        subTaskMessage,
        subTaskTimestamp,
        phase,
        params.intern
      )
    },
  }
}
