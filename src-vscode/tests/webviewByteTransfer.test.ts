import { describe, expect, it } from 'vitest'
import {
  WEBVIEW_BYTE_TRANSFER_CHUNK_BYTES,
  WebviewByteTransferAckBroker,
  WebviewByteTransferSender,
} from '../src/webviewByteTransfer'

describe('VS Code Webview byte transfer', () => {
  it('waits for each acknowledgement and sends exact bounded chunks', async () => {
    const acknowledgements = new WebviewByteTransferAckBroker()
    const messages: Array<Record<string, unknown>> = []
    let activePosts = 0
    let maxActivePosts = 0
    const target = {
      postMessage: async (message: unknown): Promise<boolean> => {
        activePosts++
        maxActivePosts = Math.max(maxActivePosts, activePosts)
        const record = message as Record<string, unknown>
        messages.push(record)
        await Promise.resolve()
        acknowledgements.acknowledge(
          record.transferId as string,
          record.sequence as number,
        )
        activePosts--
        return true
      },
    }
    const sender = new WebviewByteTransferSender(
      target,
      { throwIfCancelled: () => {} },
      acknowledgements,
    )
    // VS Code's filesystem provider may return a Node Buffer whose slice()
    // retains the entire backing store. Exercise that real runtime shape.
    const bytes = Buffer.alloc(WEBVIEW_BYTE_TRANSFER_CHUNK_BYTES + 17)

    await sender.start({ fileName: 'maa.log' })
    await sender.sendFile({ kind: 'primary', path: 'maa.log', name: 'maa.log', bytes })
    await sender.complete()

    const chunks = messages.filter(message => message.type === 'loadBytesChunk')
    expect(chunks).toHaveLength(2)
    expect((chunks[0].bytes as ArrayBuffer).byteLength).toBe(WEBVIEW_BYTE_TRANSFER_CHUNK_BYTES)
    expect((chunks[1].bytes as ArrayBuffer).byteLength).toBe(17)
    expect(maxActivePosts).toBe(1)
    expect(messages.map(message => message.type)).toEqual([
      'loadBytesStart',
      'loadBytesFileStart',
      'loadBytesChunk',
      'loadBytesChunk',
      'loadBytesFileComplete',
      'loadBytesComplete',
    ])
  })

  it('surfaces a Webview rejection to the sender', async () => {
    const acknowledgements = new WebviewByteTransferAckBroker()
    const target = {
      postMessage: async (message: unknown): Promise<boolean> => {
        const record = message as Record<string, unknown>
        acknowledgements.acknowledge(
          record.transferId as string,
          record.sequence as number,
          'receiver rejected chunk',
        )
        return true
      },
    }
    const sender = new WebviewByteTransferSender(
      target,
      { throwIfCancelled: () => {} },
      acknowledgements,
    )

    await expect(sender.start({})).rejects.toThrow('receiver rejected chunk')
  })
})
