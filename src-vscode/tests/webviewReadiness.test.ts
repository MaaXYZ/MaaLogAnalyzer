import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebviewReadiness } from '../src/webviewReadiness'
import { LoadOperationCoordinator } from '../src/archiveReader'
import { WebviewByteTransferAckBroker, WebviewByteTransferSender } from '../src/webviewByteTransfer'
import { createVSCodeByteTransferHandler } from '../../src/views/process/composables/fileLoader/useVSCodeBridge'

describe('analyzer panel readiness', () => {
  afterEach(() => vi.useRealTimers())

  it('holds a cold-open folder transfer until the file receiver is mounted', async () => {
    const readiness = new WebviewReadiness()
    const acknowledgements = new WebviewByteTransferAckBroker()
    const onUploadContent = vi.fn()
    const receiver = createVSCodeByteTransferHandler(
      { onUploadContent, onFileLoadingStart: vi.fn(), onFileLoadingEnd: vi.fn() },
      (message) =>
        acknowledgements.acknowledge(message.transferId, message.sequence, message.error),
    )
    let mounted = false
    const postMessage = vi.fn(async (message: unknown) => {
      // A Webview can accept a post before the application's listener exists.
      if (mounted) receiver.handleMessage(message)
      return true
    })
    const sender = new WebviewByteTransferSender(
      { postMessage },
      { throwIfCancelled: () => {} },
      acknowledgements,
    )
    const load = async () => {
      await readiness.wait()
      await sender.start({ fileName: 'debug' })
      await sender.sendFile({
        kind: 'primary',
        path: 'C:/logs/debug/maa.log',
        name: 'maa.log',
        bytes: new TextEncoder().encode('folder log'),
      })
      await sender.complete()
    }
    const loading = load()
    await Promise.resolve()
    expect(postMessage).not.toHaveBeenCalled()

    mounted = true
    readiness.markReady()
    await loading
    expect(onUploadContent).toHaveBeenCalledOnce()
    const primaryLogFiles = onUploadContent.mock.calls[0][5]
    expect(await primaryLogFiles[0].loadContent()).toBe('folder log')
    receiver.dispose()
    readiness.dispose()
  })

  it('remembers readiness when the existing tab is revealed again', async () => {
    const readiness = new WebviewReadiness()
    readiness.markReady()
    await expect(readiness.wait()).resolves.toBeUndefined()
    readiness.cancelPending(new Error('superseded'))
    await expect(readiness.wait()).resolves.toBeUndefined()
    readiness.dispose()
  })

  it('waits for a replacement document after image resource roots change', async () => {
    vi.useFakeTimers()
    const readiness = new WebviewReadiness()
    readiness.markReady()
    await readiness.wait()
    readiness.reset()
    const startTransfer = vi.fn()
    const loading = readiness.wait().then(startTransfer)
    await Promise.resolve()
    expect(startTransfer).not.toHaveBeenCalled()
    readiness.markReady()
    await loading
    expect(startTransfer).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    readiness.dispose()
  })

  it('cancels a superseded load while allowing the latest load to wait', async () => {
    vi.useFakeTimers()
    const readiness = new WebviewReadiness()
    const coordinator = new LoadOperationCoordinator()
    const publish = vi.fn()
    const first = coordinator.begin()
    const firstLoad = readiness.wait().then(() => {
      first.throwIfCancelled()
      publish('first')
    })
    const rejected = expect(firstLoad).rejects.toThrow('superseded')
    readiness.cancelPending(new Error('superseded'))
    const second = coordinator.begin()
    const secondLoad = readiness.wait().then(() => {
      second.throwIfCancelled()
      publish('second')
    })
    readiness.markReady()
    await rejected
    await secondLoad
    expect(publish).toHaveBeenCalledExactlyOnceWith('second')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a load cancelled just after readiness was signalled', async () => {
    const readiness = new WebviewReadiness()
    const coordinator = new LoadOperationCoordinator()
    const operation = coordinator.begin()
    const publish = vi.fn()
    const loading = readiness.wait().then(() => {
      operation.throwIfCancelled()
      publish()
    })
    const rejected = expect(loading).rejects.toThrow('cancelled')
    readiness.markReady()
    coordinator.begin()
    await rejected
    expect(publish).not.toHaveBeenCalled()
  })

  it('cleans up on close and requires fresh readiness for the reopened panel', async () => {
    vi.useFakeTimers()
    const oldPanel = new WebviewReadiness()
    const oldLoad = expect(oldPanel.wait()).rejects.toThrow('closed')
    oldPanel.dispose()
    await oldLoad
    await expect(oldPanel.wait()).rejects.toThrow('closed')
    expect(vi.getTimerCount()).toBe(0)

    const newPanel = new WebviewReadiness()
    const ready = vi.fn()
    const newLoad = newPanel.wait().then(ready)
    oldPanel.markReady()
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    newPanel.markReady()
    await newLoad
    expect(ready).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds initialization waiting and permits a retry after a late mount', async () => {
    vi.useFakeTimers()
    const readiness = new WebviewReadiness()
    const result = expect(readiness.wait(100)).rejects.toThrow('Timed out')
    await vi.advanceTimersByTimeAsync(100)
    await result
    expect(vi.getTimerCount()).toBe(0)
    readiness.markReady()
    await expect(readiness.wait()).resolves.toBeUndefined()
  })
})
