import { onMounted, onUnmounted } from 'vue'
import type { LoadedTextFile } from '../../utils/fileLoadingHelpers'
import type { FilePrimaryLogFile, LoadedPrimaryLogFile } from '../../../../utils/logFileDiscovery'
import type { UseProcessFileLoaderOptions } from './types'
import { InputResourceLimitError } from '../../../../utils/browserInputBudget'
import { replaceBlobUrl, revokeBlobUrlMap } from '../../../../utils/blobUrlMap'
import { decodeFileContent } from '../../../../utils/textEncoding'

export interface VSCodeBridgePayload {
  type: string
  content?: string
  archives?: Array<{ name: string; base64: string }>
  selectedPaths?: string[]
  primaryLogFiles?: LoadedPrimaryLogFile[]
  textFiles?: LoadedTextFile[]
  errorImages?: Array<{ key: string; base64?: string; url?: string }>
  visionImages?: Array<{ key: string; base64?: string; url?: string }>
  waitFreezesImages?: Array<{ key: string; base64?: string; url?: string }>
}

type VSCodeLoadFileOptions = Pick<
  UseProcessFileLoaderOptions,
  'onUploadContent' | 'onFileLoadingStart' | 'onFileLoadingEnd'
>

export type HostFileMessageReceiverOptions = Pick<
  UseProcessFileLoaderOptions,
  | 'onUploadFile'
  | 'onUploadContent'
  | 'onFileLoadingStart'
  | 'onFileLoadingEnd'
  | 'selectPrimaryLogs'
>

type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown, label: string): UnknownRecord => {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw new InputResourceLimitError(`${label} 格式无效`)
  }
  return value as UnknownRecord
}

const asString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new InputResourceLimitError(`${label} 格式无效`)
  return value
}

const estimateBase64Size = (value: string): number => {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor((value.length * 3) / 4) - padding
}

const decodeBase64Bytes = (value: string): Uint8Array<ArrayBuffer> => {
  const expectedSize = estimateBase64Size(value)
  const binary = atob(value)
  if (binary.length !== expectedSize) {
    throw new InputResourceLimitError('VS Code 消息中的 Base64 数据格式无效')
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const decodeImageEntries = (
  value: unknown,
  mimeType: string,
  label: string,
): Map<string, string> => {
  const images = new Map<string, string>()
  if (value == null) return images
  if (!Array.isArray(value)) throw new InputResourceLimitError(`${label} 格式无效`)

  try {
    for (let index = 0; index < value.length; index += 1) {
      const entry = asRecord(value[index], `${label}[${index}]`)
      const key = asString(entry.key, `${label}[${index}].key`)
      if (entry.url != null) {
        const url = asString(entry.url, `${label}[${index}].url`)
        const protocol = new URL(url).protocol
        if (!['https:', 'vscode-resource:', 'vscode-webview-resource:'].includes(protocol)) {
          throw new InputResourceLimitError(`${label}[${index}].url 协议无效`)
        }
        images.set(key, url)
        continue
      }
      const base64 = asString(entry.base64, `${label}[${index}].base64`)
      const bytes = decodeBase64Bytes(base64)
      replaceBlobUrl(images, key, new Blob([bytes], { type: mimeType }))
    }
    return images
  } catch (error) {
    revokeBlobUrlMap(images)
    throw error
  }
}

const decodeLoadedTextEntries = <T extends LoadedTextFile>(
  value: unknown,
  label: string,
): T[] | undefined => {
  if (value == null) return undefined
  if (!Array.isArray(value)) throw new InputResourceLimitError(`${label} 格式无效`)
  return value.map((candidate, index) => {
    const entry = asRecord(candidate, `${label}[${index}]`)
    const path = asString(entry.path, `${label}[${index}].path`)
    const name = asString(entry.name, `${label}[${index}].name`)
    const content = asString(entry.content, `${label}[${index}].content`)
    return { path, name, content } as T
  })
}

const decodeArchiveEntries = (value: unknown): File[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InputResourceLimitError('VS Code 压缩包消息格式无效')
  }
  const entries = value.map((candidate, index) => {
    const entry = asRecord(candidate, `archives[${index}]`)
    const name = asString(entry.name, `archives[${index}].name`)
    const base64 = asString(entry.base64, `archives[${index}].base64`)
    return { name, base64 }
  })

  return entries.map((entry) => {
    const bytes = decodeBase64Bytes(entry.base64)
    return new File([bytes], entry.name, { type: 'application/zip' })
  })
}

const decodeSelectedPaths = (value: unknown): Set<string> => {
  if (value == null) return new Set()
  if (!Array.isArray(value)) throw new InputResourceLimitError('selectedPaths 格式无效')
  const result = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    const path = asString(value[index], `selectedPaths[${index}]`)
    result.add(path)
  }
  return result
}

export const handleVSCodeLoadFilePayload = (
  value: unknown,
  options: VSCodeLoadFileOptions,
): boolean => {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return false
  const message = value as UnknownRecord
  if (message.type !== 'loadFile') return false

  const content = message.content == null ? '' : asString(message.content, 'content')
  if (
    !content &&
    (!Array.isArray(message.primaryLogFiles) || message.primaryLogFiles.length === 0)
  ) {
    return false
  }

  options.onFileLoadingStart()
  const createdImageMaps: Array<Map<string, string>> = []
  let adopted = false
  try {
    const primaryLogFiles = decodeLoadedTextEntries<LoadedPrimaryLogFile>(
      message.primaryLogFiles,
      'primaryLogFiles',
    )
    const textFiles = decodeLoadedTextEntries<LoadedTextFile>(message.textFiles, 'textFiles')
    const errorImages = decodeImageEntries(message.errorImages, 'image/png', 'errorImages')
    createdImageMaps.push(errorImages)
    const visionImages = decodeImageEntries(message.visionImages, 'image/jpeg', 'visionImages')
    createdImageMaps.push(visionImages)
    const waitFreezesImages = decodeImageEntries(
      message.waitFreezesImages,
      'image/jpeg',
      'waitFreezesImages',
    )
    createdImageMaps.push(waitFreezesImages)
    options.onUploadContent(
      content,
      errorImages,
      visionImages,
      waitFreezesImages,
      textFiles,
      primaryLogFiles,
    )
    adopted = true
    return true
  } finally {
    if (!adopted) {
      for (const images of createdImageMaps) revokeBlobUrlMap(images)
    }
    options.onFileLoadingEnd()
  }
}

type VSCodeByteTransferAck = {
  type: 'loadBytesAck'
  transferId: string
  sequence: number
  error?: string
}

type IncomingFileKind = 'primary' | 'text' | 'image'

interface IncomingByteFile {
  kind: IncomingFileKind
  path: string
  name: string
  size: number
  imageKey?: string
  mimeType?: string
  received: number
  parts: ArrayBuffer[]
}

interface IncomingByteTransfer {
  currentFile?: IncomingByteFile
  primaryLogFiles: FilePrimaryLogFile[]
  textFiles: LoadedTextFile[]
  errorImages: Map<string, string>
  visionImages: Map<string, string>
  waitFreezesImages: Map<string, string>
}

const asSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new InputResourceLimitError(`${label} 格式无效`)
  }
  return value as number
}

const asChunkBuffer = (value: unknown): ArrayBuffer => {
  if (value instanceof ArrayBuffer) return value
  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
  }
  throw new InputResourceLimitError('VS Code 字节分块格式无效')
}

const mergeImageEntries = (target: Map<string, string>, entries: Map<string, string>): void => {
  for (const [key, url] of entries) target.set(key, url)
}

const applyTransferPayloadImages = (transfer: IncomingByteTransfer, value: unknown): void => {
  if (value == null) return
  const payload = asRecord(value, 'payload')
  mergeImageEntries(
    transfer.errorImages,
    decodeImageEntries(payload.errorImages, 'image/png', 'errorImages'),
  )
  mergeImageEntries(
    transfer.visionImages,
    decodeImageEntries(payload.visionImages, 'image/jpeg', 'visionImages'),
  )
  mergeImageEntries(
    transfer.waitFreezesImages,
    decodeImageEntries(payload.waitFreezesImages, 'image/jpeg', 'waitFreezesImages'),
  )
}

const revokeIncomingTransfer = (transfer: IncomingByteTransfer): void => {
  revokeBlobUrlMap(transfer.errorImages)
  revokeBlobUrlMap(transfer.visionImages)
  revokeBlobUrlMap(transfer.waitFreezesImages)
  transfer.currentFile = undefined
}

export const createVSCodeByteTransferHandler = (
  options: VSCodeLoadFileOptions,
  postAcknowledgement: (message: VSCodeByteTransferAck) => void,
) => {
  const transfers = new Map<string, IncomingByteTransfer>()

  const finishTransfer = (transferId: string, adopted: boolean): void => {
    const transfer = transfers.get(transferId)
    if (!transfer) return
    transfers.delete(transferId)
    if (!adopted) revokeIncomingTransfer(transfer)
    options.onFileLoadingEnd()
  }

  const acknowledge = (transferId: string, sequence: number, error?: unknown): void => {
    postAcknowledgement({
      type: 'loadBytesAck',
      transferId,
      sequence,
      ...(error == null ? {} : { error: error instanceof Error ? error.message : String(error) }),
    })
  }

  const handleMessage = (value: unknown): boolean => {
    if (typeof value !== 'object' || value == null || Array.isArray(value)) return false
    const message = value as UnknownRecord
    const type = message.type
    if (type === 'loadBytesAbort') {
      if (typeof message.transferId === 'string') finishTransfer(message.transferId, false)
      return true
    }
    if (
      ![
        'loadBytesStart',
        'loadBytesFileStart',
        'loadBytesChunk',
        'loadBytesFileComplete',
        'loadBytesComplete',
      ].includes(type as string)
    ) {
      return false
    }

    const transferId = asString(message.transferId, 'transferId')
    const sequence = asSafeInteger(message.sequence, 'sequence')
    try {
      if (type === 'loadBytesStart') {
        for (const existingId of Array.from(transfers.keys())) finishTransfer(existingId, false)
        const payload = asRecord(message.payload, 'payload')
        options.onFileLoadingStart()
        const transfer: IncomingByteTransfer = {
          primaryLogFiles: [],
          textFiles: [],
          errorImages: new Map(),
          visionImages: new Map(),
          waitFreezesImages: new Map(),
        }
        transfers.set(transferId, transfer)
        applyTransferPayloadImages(transfer, payload)
        acknowledge(transferId, sequence)
        return true
      }

      const transfer = transfers.get(transferId)
      if (!transfer) throw new InputResourceLimitError('VS Code 字节传输不存在或已结束')

      if (type === 'loadBytesFileStart') {
        if (transfer.currentFile)
          throw new InputResourceLimitError('上一个 VS Code 字节文件尚未结束')
        const kind = asString(message.kind, 'kind') as IncomingFileKind
        if (!['primary', 'text', 'image'].includes(kind)) {
          throw new InputResourceLimitError('VS Code 字节文件类型无效')
        }
        const path = asString(message.path, 'path')
        const name = asString(message.name, 'name')
        const size = asSafeInteger(message.size, 'size')
        transfer.currentFile = {
          kind,
          path,
          name,
          size,
          imageKey: message.imageKey == null ? undefined : asString(message.imageKey, 'imageKey'),
          mimeType: message.mimeType == null ? undefined : asString(message.mimeType, 'mimeType'),
          received: 0,
          parts: [],
        }
        acknowledge(transferId, sequence)
        return true
      }

      if (type === 'loadBytesComplete') {
        if (transfer.currentFile) throw new InputResourceLimitError('VS Code 字节文件尚未结束')
        applyTransferPayloadImages(transfer, message.payload)
        if (transfer.primaryLogFiles.length === 0) {
          throw new InputResourceLimitError('VS Code 字节传输没有主日志')
        }
        options.onUploadContent(
          '',
          transfer.errorImages,
          transfer.visionImages,
          transfer.waitFreezesImages,
          transfer.textFiles.length > 0 ? transfer.textFiles : undefined,
          transfer.primaryLogFiles,
        )
        acknowledge(transferId, sequence)
        finishTransfer(transferId, true)
        return true
      }

      const file = transfer.currentFile
      if (!file) throw new InputResourceLimitError('VS Code 字节文件尚未开始')

      if (type === 'loadBytesChunk') {
        const offset = asSafeInteger(message.offset, 'offset')
        if (offset !== file.received)
          throw new InputResourceLimitError('VS Code 字节分块偏移不连续')
        const bytes = asChunkBuffer(message.bytes)
        const nextSize = file.received + bytes.byteLength
        if (!Number.isSafeInteger(nextSize) || nextSize > file.size) {
          throw new InputResourceLimitError('VS Code 字节分块超过声明大小')
        }
        file.parts.push(bytes)
        file.received = nextSize
        acknowledge(transferId, sequence)
        return true
      }

      if (type === 'loadBytesFileComplete') {
        if (file.received !== file.size) {
          throw new InputResourceLimitError('VS Code 字节文件大小与声明不一致')
        }
        const blob = new Blob(file.parts, { type: file.mimeType })
        if (file.kind === 'primary') {
          const source = new File([blob], file.name, { type: 'text/plain' })
          transfer.primaryLogFiles.push({
            path: file.path,
            name: file.name,
            file: source,
            loadContent: async () => decodeFileContent(new Uint8Array(await source.arrayBuffer())),
          })
        } else if (file.kind === 'text') {
          transfer.textFiles.push({
            path: file.path,
            name: file.name,
            loadContent: async () => decodeFileContent(new Uint8Array(await blob.arrayBuffer())),
          })
        } else {
          const imageKey = file.imageKey
          if (!imageKey) throw new InputResourceLimitError('VS Code 图片分块缺少键')
          const separator = imageKey.indexOf(':')
          const imageKind = imageKey.slice(0, separator)
          const key = imageKey.slice(separator + 1)
          if (!key || !['error', 'vision', 'wait-freezes'].includes(imageKind)) {
            throw new InputResourceLimitError('VS Code 图片分块键无效')
          }
          const images =
            imageKind === 'error'
              ? transfer.errorImages
              : imageKind === 'vision'
                ? transfer.visionImages
                : transfer.waitFreezesImages
          replaceBlobUrl(images, key, blob)
        }
        transfer.currentFile = undefined
        acknowledge(transferId, sequence)
        return true
      }

      throw new InputResourceLimitError('VS Code 字节传输消息类型无效')
    } catch (error) {
      finishTransfer(transferId, false)
      acknowledge(transferId, sequence, error)
      return true
    }
  }

  const dispose = (): void => {
    for (const transferId of Array.from(transfers.keys())) finishTransfer(transferId, false)
  }

  return { handleMessage, dispose }
}

export const useHostFileMessageReceiver = (
  options: HostFileMessageReceiverOptions,
  isInVSCode: () => boolean,
): void => {
  const byteTransfer = createVSCodeByteTransferHandler(options, (message) => {
    window.vscodeApi?.postMessage(message)
  })

  const handleVSCodeMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'object' || event.data == null || Array.isArray(event.data)) return
    const message = event.data as UnknownRecord
    try {
      if (byteTransfer.handleMessage(message)) return

      if (message.type === 'loadArchive') {
        const archives = decodeArchiveEntries(message.archives)
        const selectedPaths = decodeSelectedPaths(message.selectedPaths)
        options.onUploadFile(
          archives.length === 1 ? archives[0] : archives,
          selectedPaths.size > 0
            ? async (logOptions) => logOptions.filter((option) => selectedPaths.has(option.path))
            : options.selectPrimaryLogs,
        )
        return
      }

      if (handleVSCodeLoadFilePayload(message, options)) return

      if (message.type === 'loadZipFile') {
        handleVSCodeLoadFilePayload({ ...message, type: 'loadFile' }, options)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      window.$message?.error(`无法读取 VS Code 消息: ${detail}`)
    }
  }

  onMounted(() => {
    if (isInVSCode()) {
      window.addEventListener('message', handleVSCodeMessage)
    }
  })

  onUnmounted(() => {
    byteTransfer.dispose()
    if (isInVSCode()) {
      window.removeEventListener('message', handleVSCodeMessage)
    }
  })
}

export const useVSCodeOpenCommands = () => {
  const handleVSCodeOpen = () => {
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({ type: 'openFile' })
    } else {
      console.error('[VS Code] vscodeApi not available')
    }
  }

  const handleVSCodeOpenFolder = () => {
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({ type: 'openFolder' })
    } else {
      console.error('[VS Code] vscodeApi not available')
    }
  }

  return {
    handleVSCodeOpen,
    handleVSCodeOpenFolder,
  }
}
