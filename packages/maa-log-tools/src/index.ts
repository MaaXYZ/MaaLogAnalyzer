import type {
  KernelOutput,
} from '@windsland52/maa-log-kernel'
import {
  analyzeLogContentWith,
  DEFAULT_CORE_PARSE_OPTIONS,
} from '@windsland52/maa-log-runtime'
import { mlaRuntimeAdapter } from '@windsland52/maa-log-adapter'
import type {
  AnalyzeLogContentInput,
  ParseFileOptions,
} from '@windsland52/maa-log-runtime'
import {
  extractZipContentFromNodeBuffer,
  extractZipContentFromNodeFile,
  loadNodeLogDirectory,
  type LogBundleFocus,
} from './nodeInput'

type ParseOptions = ParseFileOptions

export interface AnalyzeZipBufferInput {
  zipData: Uint8Array
  sourceRef?: string
  focus?: LogBundleFocus
  parseOptions?: ParseOptions
  parserVersion?: string
}

export interface AnalyzeZipFileInput {
  zipFilePath: string
  focus?: LogBundleFocus
  parseOptions?: ParseOptions
  parserVersion?: string
}

export interface AnalyzeDirectoryInput {
  directoryPath: string
  focus?: LogBundleFocus
  parseOptions?: ParseOptions
  parserVersion?: string
}

export const analyzeLogContent = async (
  input: AnalyzeLogContentInput,
): Promise<KernelOutput> => {
  return analyzeLogContentWith(mlaRuntimeAdapter, {
    ...input,
    parseOptions: input.parseOptions ?? DEFAULT_CORE_PARSE_OPTIONS,
  })
}

export const analyzeZipBuffer = async (
  input: AnalyzeZipBufferInput,
): Promise<KernelOutput | null> => {
  const extracted = extractZipContentFromNodeBuffer(input.zipData, input.sourceRef, {
    focus: input.focus,
  })
  if (!extracted) return null

  return analyzeLogContent({
    content: extracted.content,
    errorImages: extracted.errorImages,
    visionImages: extracted.visionImages,
    waitFreezesImages: extracted.waitFreezesImages,
    parseOptions: input.parseOptions,
    parserVersion: input.parserVersion,
  })
}

export const analyzeZipFile = async (
  input: AnalyzeZipFileInput,
): Promise<KernelOutput | null> => {
  const extracted = await extractZipContentFromNodeFile(input.zipFilePath, {
    focus: input.focus,
  })
  if (!extracted) return null

  return analyzeLogContent({
    content: extracted.content,
    errorImages: extracted.errorImages,
    visionImages: extracted.visionImages,
    waitFreezesImages: extracted.waitFreezesImages,
    parseOptions: input.parseOptions,
    parserVersion: input.parserVersion,
  })
}

export const analyzeDirectory = async (
  input: AnalyzeDirectoryInput,
): Promise<KernelOutput | null> => {
  const extracted = await loadNodeLogDirectory(input.directoryPath, {
    focus: input.focus,
  })
  if (!extracted) return null

  return analyzeLogContent({
    content: extracted.content,
    errorImages: extracted.errorImages,
    visionImages: extracted.visionImages,
    waitFreezesImages: extracted.waitFreezesImages,
    parseOptions: input.parseOptions,
    parserVersion: input.parserVersion,
  })
}

export {
  DEFAULT_CORE_PARSE_OPTIONS,
} from '@windsland52/maa-log-runtime'
export type { AnalyzeLogContentInput, ParseFileOptions } from '@windsland52/maa-log-runtime'
export * from './nodeInput'
