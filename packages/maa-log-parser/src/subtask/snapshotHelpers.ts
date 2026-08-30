import { wrapRaw } from '../shared/rawValue'
import type { NestedActionGroup } from '../shared/types'
import { resolveTaskTerminalStatus, type TaskTerminalPhase } from '../event/meta'
import { resolveTaskLifecycleEventDetails } from '../task/lifecycle'

export type SubTaskStatus = 'running' | 'succeeded' | 'failed'

export type SubTaskSnapshot = {
  task_id: number
  entry?: string
  hash?: string
  uuid?: string
  status: SubTaskStatus
  ts?: string
  end_ts?: string
  start_message?: string
  end_message?: string
  start_details?: Record<string, any>
  end_details?: Record<string, any>
}

const markRawTaskDetails = (
  details: Record<string, any> | undefined,
): Record<string, any> | undefined => {
  if (!details) return undefined
  return wrapRaw({ ...details })
}

export const getOrCreateSubTaskSnapshot = (
  snapshots: Map<number, SubTaskSnapshot>,
  taskId: number,
): SubTaskSnapshot => {
  const existing = snapshots.get(taskId)
  if (existing) return existing

  const created: SubTaskSnapshot = {
    task_id: taskId,
    status: 'running',
  }
  snapshots.set(taskId, created)
  return created
}

export const applySubTaskSnapshotStarting = (
  snapshot: SubTaskSnapshot,
  details: Record<string, any>,
  message: string,
  timestamp: string,
  intern: (value: string) => string,
) => {
  const lifecycleDetails = resolveTaskLifecycleEventDetails(details)
  snapshot.entry = intern(lifecycleDetails.entry)
  snapshot.hash = intern(lifecycleDetails.hash)
  snapshot.uuid = intern(lifecycleDetails.uuid)
  snapshot.status = 'running'
  snapshot.ts = intern(timestamp)
  snapshot.start_message = intern(message)
  snapshot.start_details = markRawTaskDetails(details)
}

export const applySubTaskSnapshotTerminal = (
  snapshot: SubTaskSnapshot,
  details: Record<string, any>,
  message: string,
  timestamp: string,
  phase: TaskTerminalPhase,
  intern: (value: string) => string,
) => {
  snapshot.status = resolveTaskTerminalStatus(phase)
  snapshot.end_ts = intern(timestamp)
  snapshot.end_message = intern(message)
  snapshot.end_details = markRawTaskDetails(details)
}

export const mergeSubTaskActionGroupWithSnapshot = (
  group: NestedActionGroup,
  snapshot: SubTaskSnapshot,
  intern: (value: string) => string,
): NestedActionGroup => {
  const snapshotStatus: 'success' | 'failed' | 'running' =
    snapshot.status === 'failed' ? 'failed' : snapshot.status === 'running' ? 'running' : 'success'
  const mergedStatus: 'success' | 'failed' | 'running' =
    group.status === 'failed' || snapshotStatus === 'failed'
      ? 'failed'
      : group.status === 'running' || snapshotStatus === 'running'
        ? 'running'
        : 'success'
  const snapshotStartTimestamp = snapshot.ts || group.ts
  const snapshotEndTimestamp = snapshot.end_ts

  return {
    ...group,
    name: intern(snapshot.entry || group.name),
    ts: intern(snapshotStartTimestamp || group.ts),
    end_ts: snapshotEndTimestamp ? intern(snapshotEndTimestamp) : undefined,
    status: mergedStatus,
    task_details: wrapRaw({
      task_id: snapshot.task_id,
      entry: snapshot.entry || '',
      hash: snapshot.hash || '',
      uuid: snapshot.uuid || '',
      status: snapshot.status,
      ts: snapshot.ts,
      end_ts: snapshot.end_ts,
      start_message: snapshot.start_message,
      end_message: snapshot.end_message,
      start_details: snapshot.start_details,
      end_details: snapshot.end_details,
    }),
  }
}
