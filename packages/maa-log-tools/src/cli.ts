#!/usr/bin/env node
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { KernelOutput } from '@windsland52/maa-log-kernel/protocol'
import { readNodeTextFileContent } from './nodeInput'
import {
  analyzeLogContent,
  analyzeDirectory,
  analyzeZipFile,
} from './index'

const printUsage = (): void => {
  console.error('Usage: mla-log-tools <path> [--pretty] [--no-events]')
  console.error('  <path>: log file path, zip path, or log directory path')
}

const parseArgs = (argv: string[]): {
  targetPath: string | null
  pretty: boolean
  noEvents: boolean
} => {
  let targetPath: string | null = null
  let pretty = false
  let noEvents = false

  for (const arg of argv) {
    if (arg === '--pretty') {
      pretty = true
      continue
    }
    if (arg === '--no-events') {
      noEvents = true
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

  return { targetPath, pretty, noEvents }
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

const main = async (): Promise<void> => {
  const { targetPath, pretty, noEvents } = parseArgs(process.argv.slice(2))
  if (!targetPath) {
    printUsage()
    process.exit(1)
  }

  const resolvedPath = path.resolve(targetPath)
  const targetStat = await stat(resolvedPath)

  let result: KernelOutput | null = null

  if (targetStat.isDirectory()) {
    result = await analyzeDirectory({ directoryPath: resolvedPath })
  } else if (resolvedPath.toLowerCase().endsWith('.zip')) {
    result = await analyzeZipFile({ zipFilePath: resolvedPath })
  } else {
    const content = await readNodeTextFileContent(resolvedPath)
    result = await analyzeLogContent({ content })
  }

  if (!result) {
    console.error('No analyzable log content found in the provided path.')
    process.exit(2)
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
