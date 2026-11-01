import type { KernelOutput } from '@windsland52/maa-log-kernel'
import { analyzeLogContentWith, DEFAULT_CORE_PARSE_OPTIONS } from '@windsland52/maa-log-runtime'
import { mlaRuntimeAdapter } from '@windsland52/maa-log-adapter'
import type { AnalyzeLogContentInput, ParseFileOptions } from '@windsland52/maa-log-runtime'
import {
  extractZipContentFromNodeBuffer,
  extractZipContentFromNodeFile,
  loadNodeLogDirectory,
  type ArchiveLimits,
  type LogBundleFocus,
} from './nodeInput'

type ParseOptions = ParseFileOptions

export interface AnalyzeZipBufferInput {
  zipData: Uint8Array
  sourceRef?: string
  focus?: LogBundleFocus
  archiveLimits?: Partial<ArchiveLimits>
  parseOptions?: ParseOptions
  parserVersion?: string
}

export interface AnalyzeZipFileInput {
  zipFilePath: string
  focus?: LogBundleFocus
  archiveLimits?: Partial<ArchiveLimits>
  parseOptions?: ParseOptions
  parserVersion?: string
}

export interface AnalyzeDirectoryInput {
  directoryPath: string
  focus?: LogBundleFocus
  archiveLimits?: Partial<ArchiveLimits>
  parseOptions?: ParseOptions
  parserVersion?: string
}

export const analyzeLogContent = async (input: AnalyzeLogContentInput): Promise<KernelOutput> => {
  return analyzeLogContentWith(mlaRuntimeAdapter, {
    ...input,
    parseOptions: input.parseOptions ?? DEFAULT_CORE_PARSE_OPTIONS,
  })
}

/**
 * 目录 / 压缩包被合并成一段字符串后，`source.line` 是**合并后**的行号。
 * 只有当所有内容确实来自同一个文件时，才能给出可信的 sourcePath；
 * 多文件合并时留空，不制造「这一行属于某个文件」的假象。
 */
const resolveSingleSourcePath = (
  segments: readonly { path: string }[] | undefined,
): string | undefined => (segments?.length === 1 ? segments[0]?.path : undefined)

export const analyzeZipBuffer = async (
  input: AnalyzeZipBufferInput,
): Promise<KernelOutput | null> => {
  const extracted = extractZipContentFromNodeBuffer(input.zipData, input.sourceRef, {
    focus: input.focus,
    archiveLimits: input.archiveLimits,
  })
  if (!extracted) return null

  return analyzeLogContent({
    content: extracted.content,
    errorImages: extracted.errorImages,
    visionImages: extracted.visionImages,
    waitFreezesImages: extracted.waitFreezesImages,
    sourcePath: resolveSingleSourcePath(extracted.sourceSegments),
    parseOptions: input.parseOptions,
    parserVersion: input.parserVersion,
  })
}

export const analyzeZipFile = async (input: AnalyzeZipFileInput): Promise<KernelOutput | null> => {
  const extracted = await extractZipContentFromNodeFile(input.zipFilePath, {
    focus: input.focus,
    archiveLimits: input.archiveLimits,
  })
  if (!extracted) return null

  return analyzeLogContent({
    content: extracted.content,
    errorImages: extracted.errorImages,
    visionImages: extracted.visionImages,
    waitFreezesImages: extracted.waitFreezesImages,
    sourcePath: resolveSingleSourcePath(extracted.sourceSegments),
    parseOptions: input.parseOptions,
    parserVersion: input.parserVersion,
  })
}

export const analyzeDirectory = async (
  input: AnalyzeDirectoryInput,
): Promise<KernelOutput | null> => {
  const extracted = await loadNodeLogDirectory(input.directoryPath, {
    focus: input.focus,
    archiveLimits: input.archiveLimits,
  })
  if (!extracted) return null

  return analyzeLogContent({
    content: extracted.content,
    errorImages: extracted.errorImages,
    visionImages: extracted.visionImages,
    waitFreezesImages: extracted.waitFreezesImages,
    sourcePath: resolveSingleSourcePath(extracted.sourceSegments),
    parseOptions: input.parseOptions,
    parserVersion: input.parserVersion,
  })
}

export { DEFAULT_CORE_PARSE_OPTIONS } from '@windsland52/maa-log-runtime'
export type { AnalyzeLogContentInput, ParseFileOptions } from '@windsland52/maa-log-runtime'
export * from './nodeInput'
export * from './frameworkInput'
export * from './frameworkVersion'
export * from './runtimeInspection'
