import { beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  mounted: [] as Array<() => void>,
  unmounted: [] as Array<() => void>,
}))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onMounted: (callback: () => void) => lifecycle.mounted.push(callback),
    onUnmounted: (callback: () => void) => lifecycle.unmounted.push(callback),
  }
})

import {
  useHostFileMessageReceiver,
  useVSCodeOpenCommands,
} from '../useVSCodeBridge'

describe('root-owned host file receiver', () => {
  beforeEach(() => {
    lifecycle.mounted.length = 0
    lifecycle.unmounted.length = 0
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps an in-flight transfer while view-scoped open commands are recreated', async () => {
    const listeners = new Set<(event: MessageEvent) => void>()
    const postMessage = vi.fn()
    const fakeWindow = {
      isVSCode: true,
      vscodeApi: { postMessage },
      location: { search: '', protocol: 'vscode-webview:' },
      parent: undefined as unknown,
      addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
        if (type === 'message') listeners.add(listener)
      }),
      removeEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
        if (type === 'message') listeners.delete(listener)
      }),
    }
    fakeWindow.parent = fakeWindow
    vi.stubGlobal('window', fakeWindow)

    const onUploadContent = vi.fn()
    useHostFileMessageReceiver({
      onUploadFile: vi.fn(),
      onUploadContent,
      onFileLoadingStart: vi.fn(),
      onFileLoadingEnd: vi.fn(),
    }, () => true)
    lifecycle.mounted.forEach(callback => callback())

    expect(listeners).toHaveLength(1)
    const deliver = (data: Record<string, unknown>) => {
      for (const listener of listeners) listener({ data } as MessageEvent)
    }

    deliver({
      type: 'loadBytesStart', transferId: 'stable', sequence: 0, payload: {},
    })
    deliver({
      type: 'loadBytesFileStart', transferId: 'stable', sequence: 1,
      kind: 'primary', path: 'debug/maa.log', name: 'maa.log', size: 3,
    })

    // Responsive/view switches recreate these controls, but no longer recreate
    // or dispose the root-owned message receiver.
    useVSCodeOpenCommands()
    useVSCodeOpenCommands()
    expect(listeners).toHaveLength(1)

    deliver({
      type: 'loadBytesChunk', transferId: 'stable', sequence: 2,
      offset: 0, bytes: new Uint8Array([1, 2, 3]).buffer,
    })
    deliver({ type: 'loadBytesFileComplete', transferId: 'stable', sequence: 3 })
    deliver({ type: 'loadBytesComplete', transferId: 'stable', sequence: 4, payload: {} })

    expect(onUploadContent).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledTimes(5)
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ error: expect.anything() }))

    lifecycle.unmounted.forEach(callback => callback())
    expect(listeners).toHaveLength(0)
  })
})
