import { describe, expect, it, vi } from 'vitest'
import { zipSync } from 'fflate'
import {
  LoadOperationCancelledError,
  LoadOperationCoordinator,
  LoadOperationDeliveryError,
  createArchiveSelection,
  deliverLoadOperationMessage,
  inspectArchiveVolumes,
  readSelectedArchiveVolumes,
  type ArchiveVolumeInput,
} from '../src/archiveReader'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('load operation coordinator', () => {
  it('makes a new generation supersede the previous operation', () => {
    const coordinator = new LoadOperationCoordinator()
    const first = coordinator.begin()
    const second = coordinator.begin()

    expect(second.generation).toBe(first.generation + 1)
    expect(first.cancelled).toBe(true)
    expect(() => first.throwIfCancelled()).toThrow(LoadOperationCancelledError)
    expect(() => second.throwIfCancelled()).not.toThrow()

    coordinator.cancelCurrent()
    expect(second.cancelled).toBe(true)
    expect(() => second.throwIfCancelled()).toThrow(LoadOperationCancelledError)
  })

  it('serializes archive work and skips a superseded queued operation', async () => {
    const coordinator = new LoadOperationCoordinator()
    const first = coordinator.begin()
    const firstStarted = deferred()
    const releaseFirst = deferred()
    let activeTasks = 0
    let maximumActiveTasks = 0

    const firstRun = coordinator.runArchiveExclusive(first, async () => {
      activeTasks += 1
      maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks)
      firstStarted.resolve()
      try {
        await releaseFirst.promise
      } finally {
        activeTasks -= 1
      }
    })
    const firstExpectation = expect(firstRun).rejects.toBeInstanceOf(LoadOperationCancelledError)
    await firstStarted.promise

    const queued = coordinator.begin()
    const queuedTask = vi.fn()
    const queuedRun = coordinator.runArchiveExclusive(queued, queuedTask)
    const queuedExpectation = expect(queuedRun).rejects.toBeInstanceOf(LoadOperationCancelledError)

    const latest = coordinator.begin()
    const latestTask = vi.fn(async () => {
      activeTasks += 1
      maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks)
      activeTasks -= 1
      return 'latest'
    })
    const latestRun = coordinator.runArchiveExclusive(latest, latestTask)

    await Promise.resolve()
    expect(queuedTask).not.toHaveBeenCalled()
    expect(latestTask).not.toHaveBeenCalled()

    releaseFirst.resolve()
    await firstExpectation
    await queuedExpectation
    await expect(latestRun).resolves.toBe('latest')
    expect(queuedTask).not.toHaveBeenCalled()
    expect(latestTask).toHaveBeenCalledOnce()
    expect(maximumActiveTasks).toBe(1)
  })

  it('rechecks generation and delivery status around webview messages', async () => {
    const coordinator = new LoadOperationCoordinator()
    const stale = coordinator.begin()
    coordinator.begin()
    const staleTarget = { postMessage: vi.fn(async () => true) }
    await expect(
      deliverLoadOperationMessage(stale, () => staleTarget, { type: 'loadFile' }),
    ).rejects.toBeInstanceOf(LoadOperationCancelledError)
    expect(staleTarget.postMessage).not.toHaveBeenCalled()

    const current = coordinator.begin()
    const pendingDelivery = deferred<boolean>()
    const target = { postMessage: vi.fn(() => pendingDelivery.promise) }
    const delivery = deliverLoadOperationMessage(current, () => target, { type: 'loadFile' })

    coordinator.begin()
    pendingDelivery.resolve(true)
    await expect(delivery).rejects.toBeInstanceOf(LoadOperationCancelledError)

    const latest = coordinator.begin()
    const rejectingTarget = { postMessage: vi.fn(async () => false) }
    await expect(
      deliverLoadOperationMessage(latest, () => rejectingTarget, { type: 'loadFile' }),
    ).rejects.toBeInstanceOf(LoadOperationDeliveryError)
  })

  it('stops archive inspection after an awaited read is superseded', async () => {
    const archive = zipSync({ 'debug/maa.log': new Uint8Array([1, 2, 3]) }, { level: 0 })
    const input: ArchiveVolumeInput<string> = {
      source: 'logs.zip',
      name: 'logs.zip',
      size: archive.byteLength,
    }
    const pendingRead = deferred<Uint8Array>()
    const coordinator = new LoadOperationCoordinator()
    const operation = coordinator.begin()
    const inspection = inspectArchiveVolumes(
      [input],
      () => pendingRead.promise,
      {},
      () => operation.throwIfCancelled(),
    )

    coordinator.begin()
    pendingRead.resolve(archive)

    await expect(inspection).rejects.toBeInstanceOf(LoadOperationCancelledError)
  })

  it('stops selected extraction after cancellation between streamed input chunks', async () => {
    const content = new Uint8Array(5 * 1024 * 1024)
    for (let index = 0; index < content.byteLength; index += 4096) {
      content[index] = index & 0xff
    }
    const archive = zipSync({ 'debug/maa.log': content }, { level: 0 })
    const input: ArchiveVolumeInput<Uint8Array> = {
      source: archive,
      name: 'logs.zip',
      size: archive.byteLength,
    }
    const readVolume = async ({ source }: ArchiveVolumeInput<Uint8Array>) => source
    const coordinator = new LoadOperationCoordinator()
    const operation = coordinator.begin()
    const checkActive = () => operation.throwIfCancelled()
    const inspected = await inspectArchiveVolumes([input], readVolume, {}, checkActive)
    const consumeEntries = vi.fn()

    const extraction = readSelectedArchiveVolumes(
      inspected,
      createArchiveSelection(['debug/maa.log'], 'debug'),
      readVolume,
      consumeEntries,
      {},
      checkActive,
    )
    setImmediate(() => coordinator.begin())

    await expect(extraction).rejects.toBeInstanceOf(LoadOperationCancelledError)
    expect(consumeEntries).not.toHaveBeenCalled()
  })
})
