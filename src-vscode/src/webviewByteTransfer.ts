export const WEBVIEW_BYTE_TRANSFER_CHUNK_BYTES = 4 * 1024 * 1024

export type WebviewByteTransferFileKind = 'primary' | 'text' | 'image'

export interface WebviewByteTransferFile {
  kind: WebviewByteTransferFileKind
  path: string
  name: string
  bytes: Uint8Array
  imageKey?: string
  mimeType?: string
}

export interface WebviewByteTransferOperation {
  throwIfCancelled(): void
}

export interface WebviewByteTransferTarget {
  postMessage(message: unknown): PromiseLike<boolean>
}

interface PendingAcknowledgement {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const acknowledgementKey = (transferId: string, sequence: number): string =>
  `${transferId}:${sequence}`

export class WebviewByteTransferAckBroker {
  private readonly pending = new Map<string, PendingAcknowledgement>()

  wait(transferId: string, sequence: number, timeoutMs = 30_000): Promise<void> {
    const key = acknowledgementKey(transferId, sequence)
    if (this.pending.has(key)) {
      throw new Error(`Duplicate VS Code byte-transfer acknowledgement: ${key}`)
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key)
        reject(
          new Error(`Timed out waiting for VS Code Webview byte-transfer acknowledgement: ${key}`),
        )
      }, timeoutMs)
      this.pending.set(key, { resolve, reject, timer })
    })
  }

  acknowledge(transferId: string, sequence: number, error?: string): boolean {
    const key = acknowledgementKey(transferId, sequence)
    const pending = this.pending.get(key)
    if (!pending) return false
    this.pending.delete(key)
    clearTimeout(pending.timer)
    if (error) pending.reject(new Error(error))
    else pending.resolve()
    return true
  }

  reject(transferId: string, sequence: number, error: Error): void {
    const key = acknowledgementKey(transferId, sequence)
    const pending = this.pending.get(key)
    if (!pending) return
    this.pending.delete(key)
    clearTimeout(pending.timer)
    pending.reject(error)
  }

  cancelTransfer(transferId: string, error: Error): void {
    for (const [key, pending] of this.pending) {
      if (!key.startsWith(`${transferId}:`)) continue
      this.pending.delete(key)
      clearTimeout(pending.timer)
      pending.reject(error)
    }
  }

  cancelAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

let nextTransferId = 0

export class WebviewByteTransferSender {
  readonly transferId = `load-${Date.now()}-${++nextTransferId}`
  private sequence = 0
  private started = false
  private finished = false

  constructor(
    private readonly target: WebviewByteTransferTarget,
    private readonly operation: WebviewByteTransferOperation,
    private readonly acknowledgements: WebviewByteTransferAckBroker,
  ) {}

  private async send(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (this.finished) throw new Error('VS Code byte transfer is already finished')
    this.operation.throwIfCancelled()
    const sequence = this.sequence++
    const acknowledgement = this.acknowledgements.wait(this.transferId, sequence)
    try {
      const delivered = await this.target.postMessage({
        type,
        transferId: this.transferId,
        sequence,
        ...payload,
      })
      if (!delivered) {
        throw new Error('The VS Code Webview rejected a byte-transfer message')
      }
    } catch (error) {
      const deliveryError = error instanceof Error ? error : new Error(String(error))
      this.acknowledgements.reject(this.transferId, sequence, deliveryError)
    }
    await acknowledgement
    this.operation.throwIfCancelled()
  }

  async start(payload: Record<string, unknown>): Promise<void> {
    if (this.started) throw new Error('VS Code byte transfer has already started')
    this.started = true
    await this.send('loadBytesStart', { payload })
  }

  async sendFile(file: WebviewByteTransferFile): Promise<void> {
    if (!this.started) throw new Error('VS Code byte transfer has not started')
    await this.send('loadBytesFileStart', {
      kind: file.kind,
      path: file.path,
      name: file.name,
      size: file.bytes.byteLength,
      imageKey: file.imageKey,
      mimeType: file.mimeType,
    })

    for (
      let offset = 0;
      offset < file.bytes.byteLength;
      offset += WEBVIEW_BYTE_TRANSFER_CHUNK_BYTES
    ) {
      this.operation.throwIfCancelled()
      const end = Math.min(offset + WEBVIEW_BYTE_TRANSFER_CHUNK_BYTES, file.bytes.byteLength)
      // vscode.workspace.fs.readFile may return a Node Buffer. Buffer.slice()
      // keeps the full file backing store, unlike Uint8Array.slice(), so always
      // allocate and copy an exact chunk before structured clone.
      const chunk = new Uint8Array(end - offset)
      chunk.set(file.bytes.subarray(offset, end))
      await this.send('loadBytesChunk', {
        offset,
        bytes: chunk.buffer,
      })
    }

    await this.send('loadBytesFileComplete')
  }

  async complete(payload: Record<string, unknown> = {}): Promise<void> {
    if (!this.started) throw new Error('VS Code byte transfer has not started')
    await this.send('loadBytesComplete', { payload })
    this.finished = true
  }

  async abort(message: string): Promise<void> {
    if (!this.started || this.finished) return
    this.finished = true
    this.acknowledgements.cancelTransfer(this.transferId, new Error(message))
    try {
      await this.target.postMessage({
        type: 'loadBytesAbort',
        transferId: this.transferId,
        message,
      })
    } catch {
      // The Webview may already be gone; local acknowledgement state is clean.
    }
  }
}
