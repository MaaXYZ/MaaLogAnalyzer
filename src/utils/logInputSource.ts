import type { ParseSourceInput } from '@windsland52/maa-log-parser'
import type { LogParserWorkerInput } from './parserWorkerProtocol'
import { decodeFileContent } from './textEncoding'

type LogParseSourceMetadata = Omit<ParseSourceInput, 'content'>

export type LogParseSourceInput = LogParseSourceMetadata &
  (
    | { content: string; bytes?: never; file?: never; loadBytes?: never }
    | { content?: never; bytes: Uint8Array; file?: never; loadBytes?: never }
    | { content?: never; bytes?: never; file: File; loadBytes?: never }
    | { content?: never; bytes?: never; file?: never; loadBytes: () => Promise<Uint8Array> }
  )

const readSourceBytes = async (input: LogParseSourceInput): Promise<Uint8Array> => {
  if ('bytes' in input && input.bytes) return input.bytes
  if ('file' in input && input.file) {
    return new Uint8Array(await input.file.arrayBuffer())
  }
  if ('loadBytes' in input && input.loadBytes) return await input.loadBytes()
  throw new Error('日志解析输入没有可读取的原始字节')
}

export const toExactArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer
  }
  return bytes.slice().buffer as ArrayBuffer
}

export const materializeInlineParseInput = async (
  input: LogParseSourceInput,
): Promise<ParseSourceInput> => ({
  content:
    'content' in input && typeof input.content === 'string'
      ? input.content
      : decodeFileContent(await readSourceBytes(input)),
  sourceKey: input.sourceKey,
  sourcePath: input.sourcePath,
  inputIndex: input.inputIndex,
})

export const materializeWorkerParseInput = async (
  input: LogParseSourceInput,
): Promise<LogParserWorkerInput> => {
  const metadata = {
    sourceKey: input.sourceKey,
    sourcePath: input.sourcePath,
    inputIndex: input.inputIndex,
  }
  if ('content' in input && typeof input.content === 'string') {
    return { ...metadata, content: input.content }
  }
  return {
    ...metadata,
    bytes: toExactArrayBuffer(await readSourceBytes(input)),
  }
}
