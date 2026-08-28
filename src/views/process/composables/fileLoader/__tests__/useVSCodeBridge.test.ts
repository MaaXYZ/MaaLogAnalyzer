import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createVSCodeByteTransferHandler,
  handleVSCodeLoadFilePayload,
} from '../useVSCodeBridge'

describe('VS Code loadFile bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards archive search text alongside selected primary logs', () => {
    const onUploadContent = vi.fn()
    const onFileLoadingStart = vi.fn()
    const onFileLoadingEnd = vi.fn()
    const textFiles = [{ path: 'debug/report.txt', name: 'report.txt', content: 'details' }]
    const primaryLogFiles = [{ path: 'debug/maa.log', name: 'maa.log', content: 'log' }]

    const handled = handleVSCodeLoadFilePayload(
      { type: 'loadFile', content: '', textFiles, primaryLogFiles },
      { onUploadContent, onFileLoadingStart, onFileLoadingEnd },
    )

    expect(handled).toBe(true)
    expect(onFileLoadingStart).toHaveBeenCalledOnce()
    expect(onFileLoadingEnd).toHaveBeenCalledOnce()
    expect(onUploadContent).toHaveBeenCalledWith(
      '',
      new Map(),
      new Map(),
      new Map(),
      textFiles,
      primaryLogFiles,
    )
  })

  it('ends loading and revokes decoded images when a later field is invalid', () => {
    const onUploadContent = vi.fn()
    const onFileLoadingStart = vi.fn()
    const onFileLoadingEnd = vi.fn()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:error-image')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    expect(() => handleVSCodeLoadFilePayload(
      {
        type: 'loadFile',
        content: 'log',
        errorImages: [{ key: 'error', base64: btoa('image') }],
        visionImages: [{ key: 'vision', base64: 'not-base64' }],
      },
      { onUploadContent, onFileLoadingStart, onFileLoadingEnd },
    )).toThrow()

    expect(onUploadContent).not.toHaveBeenCalled()
    expect(onFileLoadingStart).toHaveBeenCalledOnce()
    expect(onFileLoadingEnd).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:error-image')
  })

  it('forwards webview image resource URLs without Base64 decoding', () => {
    const onUploadContent = vi.fn()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    const imageUrl = 'https://file+.vscode-resource.vscode-cdn.net/c%3A/logs/vision/image.jpg'

    expect(handleVSCodeLoadFilePayload(
      {
        type: 'loadFile',
        content: 'log',
        visionImages: [{ key: 'vision', url: imageUrl }],
      },
      {
        onUploadContent,
        onFileLoadingStart: vi.fn(),
        onFileLoadingEnd: vi.fn(),
      },
    )).toBe(true)

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(onUploadContent).toHaveBeenCalledWith(
      'log',
      new Map(),
      new Map([['vision', imageUrl]]),
      new Map(),
      undefined,
      undefined,
    )
  })

  it('rejects malformed loaded-file entries without leaving loading active', () => {
    const onUploadContent = vi.fn()
    const onFileLoadingStart = vi.fn()
    const onFileLoadingEnd = vi.fn()

    expect(() => handleVSCodeLoadFilePayload(
      {
        type: 'loadFile',
        content: 'log',
        primaryLogFiles: [{ path: 'maa.log', name: 'maa.log', content: 42 }],
      },
      { onUploadContent, onFileLoadingStart, onFileLoadingEnd },
    )).toThrow(/primaryLogFiles/)

    expect(onUploadContent).not.toHaveBeenCalled()
    expect(onFileLoadingEnd).toHaveBeenCalledOnce()
  })

  it('assembles acknowledged byte chunks into a File-backed parser input', async () => {
    const onUploadContent = vi.fn()
    const onFileLoadingStart = vi.fn()
    const onFileLoadingEnd = vi.fn()
    const acknowledgements = vi.fn()
    const receiver = createVSCodeByteTransferHandler(
      { onUploadContent, onFileLoadingStart, onFileLoadingEnd },
      acknowledgements,
    )
    const encoder = new TextEncoder()
    const first = encoder.encode('hello ').buffer
    const second = encoder.encode('world').buffer

    expect(receiver.handleMessage({
      type: 'loadBytesStart',
      transferId: 'transfer-1',
      sequence: 0,
      payload: {},
    })).toBe(true)
    receiver.handleMessage({
      type: 'loadBytesFileStart',
      transferId: 'transfer-1',
      sequence: 1,
      kind: 'primary',
      path: 'debug/maa.log',
      name: 'maa.log',
      size: 11,
    })
    receiver.handleMessage({
      type: 'loadBytesChunk',
      transferId: 'transfer-1',
      sequence: 2,
      offset: 0,
      bytes: first,
    })
    receiver.handleMessage({
      type: 'loadBytesChunk',
      transferId: 'transfer-1',
      sequence: 3,
      offset: 6,
      bytes: second,
    })
    receiver.handleMessage({
      type: 'loadBytesFileComplete',
      transferId: 'transfer-1',
      sequence: 4,
    })
    receiver.handleMessage({
      type: 'loadBytesComplete',
      transferId: 'transfer-1',
      sequence: 5,
      payload: {},
    })

    expect(onFileLoadingStart).toHaveBeenCalledOnce()
    expect(onFileLoadingEnd).toHaveBeenCalledOnce()
    expect(acknowledgements).toHaveBeenCalledTimes(6)
    const primaryLogFiles = onUploadContent.mock.calls[0][5]
    expect(primaryLogFiles).toHaveLength(1)
    expect(primaryLogFiles[0]).toMatchObject({ path: 'debug/maa.log', name: 'maa.log' })
    expect(await primaryLogFiles[0].loadContent()).toBe('hello world')
  })

  it('rejects a discontinuous byte chunk and ends the transfer', () => {
    const onFileLoadingEnd = vi.fn()
    const acknowledgements = vi.fn()
    const receiver = createVSCodeByteTransferHandler(
      {
        onUploadContent: vi.fn(),
        onFileLoadingStart: vi.fn(),
        onFileLoadingEnd,
      },
      acknowledgements,
    )
    receiver.handleMessage({
      type: 'loadBytesStart',
      transferId: 'transfer-2',
      sequence: 0,
      payload: {},
    })
    receiver.handleMessage({
      type: 'loadBytesFileStart',
      transferId: 'transfer-2',
      sequence: 1,
      kind: 'primary',
      path: 'maa.log',
      name: 'maa.log',
      size: 1,
    })
    receiver.handleMessage({
      type: 'loadBytesChunk',
      transferId: 'transfer-2',
      sequence: 2,
      offset: 1,
      bytes: new Uint8Array([1]).buffer,
    })

    expect(onFileLoadingEnd).toHaveBeenCalledOnce()
    expect(acknowledgements).toHaveBeenLastCalledWith(expect.objectContaining({
      transferId: 'transfer-2',
      sequence: 2,
      error: expect.stringContaining('偏移不连续'),
    }))
  })
})
