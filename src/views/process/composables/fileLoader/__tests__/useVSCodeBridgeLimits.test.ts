import { describe, expect, it, vi } from 'vitest'
import { createVSCodeByteTransferHandler } from '../useVSCodeBridge'

const createReceiver = () => {
  const acknowledgements = vi.fn()
  const receiver = createVSCodeByteTransferHandler(
    {
      onUploadContent: vi.fn(),
      onFileLoadingStart: vi.fn(),
      onFileLoadingEnd: vi.fn(),
    },
    acknowledgements,
  )
  return { acknowledgements, receiver }
}

describe('VS Code unmetered local byte transfer', () => {
  it('accepts a large declared local log without a resource budget', () => {
    const { acknowledgements, receiver } = createReceiver()
    receiver.handleMessage({
      type: 'loadBytesStart',
      transferId: 'large-local',
      sequence: 0,
      payload: {},
    })
    receiver.handleMessage({
      type: 'loadBytesFileStart',
      transferId: 'large-local',
      sequence: 1,
      kind: 'primary',
      path: 'debug/maa.log',
      name: 'maa.log',
      size: 512 * 1024 * 1024,
    })

    expect(acknowledgements).toHaveBeenLastCalledWith(expect.objectContaining({
      transferId: 'large-local',
      sequence: 1,
    }))
    expect(acknowledgements).not.toHaveBeenLastCalledWith(expect.objectContaining({
      error: expect.anything(),
    }))
    receiver.handleMessage({ type: 'loadBytesAbort', transferId: 'large-local' })
  })

  it('still rejects an invalid non-safe declared size', () => {
    const { acknowledgements, receiver } = createReceiver()
    receiver.handleMessage({
      type: 'loadBytesStart', transferId: 'invalid-size', sequence: 0, payload: {},
    })
    receiver.handleMessage({
      type: 'loadBytesFileStart',
      transferId: 'invalid-size',
      sequence: 1,
      kind: 'primary',
      path: 'debug/maa.log',
      name: 'maa.log',
      size: Number.MAX_SAFE_INTEGER + 1,
    })

    expect(acknowledgements).toHaveBeenLastCalledWith(expect.objectContaining({
      transferId: 'invalid-size',
      sequence: 1,
      error: expect.stringContaining('size 格式无效'),
    }))
  })
})
