import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GitHub Actions supply-chain pins', () => {
  it('pins every remote action to an immutable commit', () => {
    const root = resolve(import.meta.dirname, '../../..')
    const files = readdirSync(resolve(root, '.github'), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
      .map((file) => `.github/${file.replace(/\\/g, '/')}`)
    const mutableReferences: string[] = []

    for (const file of files) {
      const lines = readFileSync(resolve(root, file), 'utf8').split(/\r?\n/)
      lines.forEach((line, index) => {
        const reference = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/.exec(line)?.[1]
        if (!reference || reference.startsWith('./')) return
        if (!/@[0-9a-f]{40}$/.test(reference)) {
          mutableReferences.push(`${file}:${index + 1}: ${reference}`)
        }
      })
    }

    expect(mutableReferences).toEqual([])
  })
})
