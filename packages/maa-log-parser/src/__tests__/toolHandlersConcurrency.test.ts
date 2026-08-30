import { describe, expect, it } from 'vitest'
import { createAnalyzerSessionStore } from '../service/sessionStore'
import { createAnalyzerToolHandlers } from '../service/toolHandlers'
import type { ResolvedLogSourceInput } from '../service/types'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const makeTaskContent = (taskId: number): string => {
  const details = JSON.stringify({
    task_id: taskId,
    entry: `Task${taskId}`,
    hash: `hash-${taskId}`,
    uuid: `uuid-${taskId}`,
  })
  return [
    `[2026-04-14 10:00:00.001][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details=${details}]`,
    `[2026-04-14 10:00:00.002][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Succeeded] [details=${details}]`,
  ].join('\n')
}

const createResolvedInput = (taskId: number): ResolvedLogSourceInput => ({
  content: makeTaskContent(taskId),
  source_key: `task-${taskId}.log`,
})

describe('Analyzer tool handler parse concurrency', () => {
  it('does not let an older parse overwrite a newer session result', async () => {
    const oldInput = createDeferred<ResolvedLogSourceInput>()
    const newInput = createDeferred<ResolvedLogSourceInput>()
    const store = createAnalyzerSessionStore()
    const handlers = createAnalyzerToolHandlers({
      store,
      resolve_input(input) {
        return input.path === '/logs/old.log' ? oldInput.promise : newInput.promise
      },
    })

    const oldParse = handlers.parse_log_bundle({
      session_id: 'shared-session',
      inputs: [{ path: '/logs/old.log', kind: 'file' }],
    })
    const newParse = handlers.parse_log_bundle({
      session_id: 'shared-session',
      inputs: [{ path: '/logs/new.log', kind: 'file' }],
    })

    newInput.resolve(createResolvedInput(2))
    const newResult = await newParse
    expect(newResult.ok).toBe(true)
    expect(store.get('shared-session')?.tasks[0]?.task_id).toBe(2)

    oldInput.resolve(createResolvedInput(1))
    const oldResult = await oldParse
    expect(oldResult).toMatchObject({
      ok: false,
      error: {
        code: 'DATA_NOT_READY',
        retryable: true,
      },
    })
    expect(store.get('shared-session')?.tasks[0]?.task_id).toBe(2)
  })

  it('coordinates generations across handlers sharing one store', async () => {
    const oldInput = createDeferred<ResolvedLogSourceInput>()
    const newInput = createDeferred<ResolvedLogSourceInput>()
    const store = createAnalyzerSessionStore()
    const oldHandlers = createAnalyzerToolHandlers({
      store,
      resolve_input: () => oldInput.promise,
    })
    const newHandlers = createAnalyzerToolHandlers({
      store,
      resolve_input: () => newInput.promise,
    })

    const oldParse = oldHandlers.parse_log_bundle({
      session_id: 'shared-store-session',
      inputs: [{ path: '/logs/old.log', kind: 'file' }],
    })
    const newParse = newHandlers.parse_log_bundle({
      session_id: 'shared-store-session',
      inputs: [{ path: '/logs/new.log', kind: 'file' }],
    })

    newInput.resolve(createResolvedInput(4))
    expect((await newParse).ok).toBe(true)
    oldInput.resolve(createResolvedInput(3))
    const oldResult = await oldParse

    expect(oldResult.ok).toBe(false)
    if (!oldResult.ok) {
      expect(oldResult.error.code).toBe('DATA_NOT_READY')
    }
    expect(store.get('shared-store-session')?.tasks[0]?.task_id).toBe(4)
  })

  it('keeps concurrent parses for different sessions independent', async () => {
    const firstInput = createDeferred<ResolvedLogSourceInput>()
    const secondInput = createDeferred<ResolvedLogSourceInput>()
    const store = createAnalyzerSessionStore()
    const handlers = createAnalyzerToolHandlers({
      store,
      resolve_input(input) {
        return input.path === '/logs/first.log' ? firstInput.promise : secondInput.promise
      },
    })

    const firstParse = handlers.parse_log_bundle({
      session_id: 'first-session',
      inputs: [{ path: '/logs/first.log', kind: 'file' }],
    })
    const secondParse = handlers.parse_log_bundle({
      session_id: 'second-session',
      inputs: [{ path: '/logs/second.log', kind: 'file' }],
    })

    secondInput.resolve(createResolvedInput(6))
    firstInput.resolve(createResolvedInput(5))

    expect((await secondParse).ok).toBe(true)
    expect((await firstParse).ok).toBe(true)
    expect(store.get('first-session')?.tasks[0]?.task_id).toBe(5)
    expect(store.get('second-session')?.tasks[0]?.task_id).toBe(6)
  })
})
