#!/usr/bin/env node
import { main } from '@windsland52/maa-log-tools/cli'

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
