/// <reference lib="webworker" />

import { LogParser, type ParseSourceInput } from '@windsland52/maa-log-parser'
import { decodeFileContent } from '../utils/textEncoding'
import { sortPrimaryLogParseInputs } from '../utils/logFileDiscovery'
import type {
  LogParserWorkerInput,
  LogParserWorkerRequest,
  LogParserWorkerResponse,
} from '../utils/parserWorkerProtocol'

const post = (message: LogParserWorkerResponse): void => {
  self.postMessage(message)
}

const toParseSourceInput = (input: LogParserWorkerInput, index: number): ParseSourceInput => {
  const content = input.bytes
    ? decodeFileContent(new Uint8Array(input.bytes))
    : (input.content ?? '')
  // The transferred backing store is otherwise retained by request.inputs for
  // the whole parse. Drop it as soon as its string has been materialized.
  input.bytes = undefined
  input.content = undefined
  return {
    content,
    sourceKey: input.sourceKey,
    sourcePath: input.sourcePath,
    inputIndex: input.inputIndex ?? index,
  }
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

self.onmessage = async (event: MessageEvent<LogParserWorkerRequest>) => {
  const request = event.data
  if (request?.type !== 'parse') return

  const { requestId } = request
  try {
    const parser = new LogParser()
    parser.setErrorImages(request.errorImages ?? new Map())
    parser.setVisionImages(request.visionImages ?? new Map())
    parser.setWaitFreezesImages(request.waitFreezesImages ?? new Map())

    const decodedInputs = request.inputs.map(toParseSourceInput)
    request.inputs.length = 0
    const parseInputs = request.sortInputsByTimestamp
      ? sortPrimaryLogParseInputs(decodedInputs)
      : decodedInputs

    await parser.parseInputs(parseInputs, (progress) => {
      post({ type: 'progress', requestId, percentage: progress.percentage })
    })

    post({ type: 'result', requestId, tasks: parser.consumeTasks() })
  } catch (error) {
    post({ type: 'error', requestId, message: getErrorMessage(error) })
  }
}
