#!/usr/bin/env node
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { KernelOutput } from '@windsland52/maa-log-kernel/protocol'
import { loadFrameworkLogSources } from './frameworkInput'
import {
  extractFrameworkSessions,
  type FrameworkSession,
  type FrameworkSessionExtraction,
  type FrameworkVersionSummary,
} from './frameworkVersion'
import {
  loadNodeLogDirectory,
  extractZipContentFromNodeFile,
  readNodeTextFileContent,
} from './nodeInput'
import type { SourceSegment } from './runtimeInspection'
import {
  analyzeLogContent,
  buildRuntimeInspection,
} from './index'

const printUsage = (): void => {
  console.error('Usage: mla-log-tools <path> [--pretty] [--no-events] [--preflight|--runtime-inspection]')
  console.error('  <path>: log file path, zip path, or log directory path')
}

const parseArgs = (argv: string[]): {
  targetPath: string | null
  pretty: boolean
  noEvents: boolean
  preflight: boolean
  runtimeInspection: boolean
} => {
  let targetPath: string | null = null
  let pretty = false
  let noEvents = false
  let preflight = false
  let runtimeInspection = false

  for (const arg of argv) {
    if (arg === '--pretty') {
      pretty = true
      continue
    }
    if (arg === '--no-events') {
      noEvents = true
      continue
    }
    if (arg === '--preflight') {
      preflight = true
      continue
    }
    if (arg === '--runtime-inspection') {
      runtimeInspection = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
    if (!targetPath) {
      targetPath = arg
    }
  }

  return { targetPath, pretty, noEvents, preflight, runtimeInspection }
}

const renderOutput = (
  output: KernelOutput,
  pretty: boolean,
  noEvents: boolean,
): string => {
  const payload = noEvents
    ? { ...output, events: [] }
    : output
  return JSON.stringify(payload, null, pretty ? 2 : 0)
}

export const MLA_PREFLIGHT_SCHEMA_VERSION = 'mla-preflight/v1'

export type PreflightReason =
  | 'notify_events_parsed'
  | 'empty_log'
  | 'no_notify_events'
  | 'no_task_lifecycle'
  | 'no_analyzable_content'

export interface PreflightOutput {
  schemaVersion: typeof MLA_PREFLIGHT_SCHEMA_VERSION
  status: 'supported' | 'unsupported'
  reason: PreflightReason
  parserVersion: string | null
  taskCount: number
  eventCount: number
  nodeStatisticCount: number
  recognitionStatisticCount: number
  frameworkVersionSummary: FrameworkVersionSummary
  frameworkSessions: FrameworkSession[]
  warnings: string[]
}

const EMPTY_FRAMEWORK_EXTRACTION: FrameworkSessionExtraction = {
  sessions: [],
  summary: { status: 'none', versions: [] },
  warnings: [],
}

export const buildPreflightOutput = (
  output: KernelOutput | null,
  framework: FrameworkSessionExtraction = EMPTY_FRAMEWORK_EXTRACTION,
): PreflightOutput => {
  if (!output) {
    return {
      schemaVersion: MLA_PREFLIGHT_SCHEMA_VERSION,
      status: 'unsupported',
      reason: 'no_analyzable_content',
      parserVersion: null,
      taskCount: 0,
      eventCount: 0,
      nodeStatisticCount: 0,
      recognitionStatisticCount: 0,
      frameworkVersionSummary: framework.summary,
      frameworkSessions: framework.sessions,
      warnings: framework.warnings,
    }
  }

  const reason: PreflightReason = output.events.length > 0
    ? output.tasks.length > 0
      ? 'notify_events_parsed'
      : 'no_task_lifecycle'
    : output.warnings.includes('Empty log content.')
      ? 'empty_log'
      : 'no_notify_events'
  return {
    schemaVersion: MLA_PREFLIGHT_SCHEMA_VERSION,
    status: reason === 'notify_events_parsed' ? 'supported' : 'unsupported',
    reason,
    parserVersion: output.meta.parserVersion,
    taskCount: output.tasks.length,
    eventCount: output.events.length,
    nodeStatisticCount: output.stats.nodes.length,
    recognitionStatisticCount: output.stats.recognitionActions.length,
    frameworkVersionSummary: framework.summary,
    frameworkSessions: framework.sessions,
    warnings: [...output.warnings, ...framework.warnings],
  }
}

export const main = async (): Promise<void> => {
  const {
    targetPath,
    pretty,
    noEvents,
    preflight,
    runtimeInspection,
  } = parseArgs(process.argv.slice(2))
  if (preflight && runtimeInspection) {
    console.error('--preflight and --runtime-inspection are mutually exclusive.')
    process.exit(1)
  }
  if (!targetPath) {
    printUsage()
    process.exit(1)
  }

  const resolvedPath = path.resolve(targetPath)
  const targetStat = await stat(resolvedPath)
  const framework = preflight || runtimeInspection
    ? extractFrameworkSessions(await loadFrameworkLogSources(resolvedPath))
    : EMPTY_FRAMEWORK_EXTRACTION

  let result: KernelOutput | null = null
  let sourceSegments: readonly SourceSegment[] | undefined

  if (targetStat.isDirectory()) {
    const extracted = await loadNodeLogDirectory(resolvedPath)
    if (extracted) {
      sourceSegments = extracted.sourceSegments
      result = await analyzeLogContent({
        content: extracted.content,
        errorImages: extracted.errorImages,
        visionImages: extracted.visionImages,
        waitFreezesImages: extracted.waitFreezesImages,
      })
    }
  } else if (resolvedPath.toLowerCase().endsWith('.zip')) {
    const extracted = await extractZipContentFromNodeFile(resolvedPath)
    if (extracted) {
      sourceSegments = extracted.sourceSegments
      result = await analyzeLogContent({
        content: extracted.content,
        errorImages: extracted.errorImages,
        visionImages: extracted.visionImages,
        waitFreezesImages: extracted.waitFreezesImages,
      })
    }
  } else {
    const content = await readNodeTextFileContent(resolvedPath)
    const lineCount = (content.match(/\n/g) ?? []).length + 1
    sourceSegments = [{
      source: `file:${resolvedPath.replace(/\\/g, '/')}`,
      path: path.basename(resolvedPath),
      startLine: 1,
      lineCount,
    }]
    result = await analyzeLogContent({ content })
  }

  if (!result) {
    if (preflight) {
      process.stdout.write(JSON.stringify(
        buildPreflightOutput(null, framework),
        null,
        pretty ? 2 : 0,
      ))
      process.stdout.write('\n')
    }
    console.error('No analyzable log content found in the provided path.')
    process.exit(2)
  }

  if (preflight) {
    const output = buildPreflightOutput(result, framework)
    process.stdout.write(JSON.stringify(output, null, pretty ? 2 : 0))
    process.stdout.write('\n')
    if (output.status === 'unsupported') {
      process.exit(3)
    }
    return
  }

  if (runtimeInspection) {
    process.stdout.write(JSON.stringify(
      buildRuntimeInspection(result, framework, sourceSegments),
      null,
      pretty ? 2 : 0,
    ))
    process.stdout.write('\n')
    return
  }

  process.stdout.write(renderOutput(result, pretty, noEvents))
  process.stdout.write('\n')
}

const isEntrypoint = (): boolean => {
  const argvPath = process.argv[1]
  if (!argvPath) {
    return false
  }
  return import.meta.url === pathToFileURL(path.resolve(argvPath)).href
}

if (isEntrypoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}
