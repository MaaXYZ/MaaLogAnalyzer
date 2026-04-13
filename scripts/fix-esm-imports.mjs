import { promises as fs } from 'node:fs'
import path from 'node:path'

const distArg = process.argv[2]

if (!distArg) {
  console.error('Usage: node scripts/fix-esm-imports.mjs <dist-dir>')
  process.exit(1)
}

const distDir = path.resolve(process.cwd(), distArg)

const toJsSpecifier = (specifier) => {
  if (!specifier.startsWith('.')) {
    return specifier
  }

  const queryIndex = specifier.search(/[?#]/)
  const bare = queryIndex === -1 ? specifier : specifier.slice(0, queryIndex)
  const suffix = queryIndex === -1 ? '' : specifier.slice(queryIndex)

  if (path.extname(bare)) {
    return specifier
  }

  if (bare.endsWith('/')) {
    return `${bare}index.js${suffix}`
  }

  return `${bare}.js${suffix}`
}

const rewriteImportSpecifiers = (content) => {
  let output = content

  const patterns = [
    /(from\s+['"])([^'"]+)(['"])/g,
    /(import\s+['"])([^'"]+)(['"])/g,
    /(import\(\s*['"])([^'"]+)(['"]\s*\))/g,
  ]

  for (const pattern of patterns) {
    output = output.replace(pattern, (full, prefix, specifier, suffix) => {
      return `${prefix}${toJsSpecifier(specifier)}${suffix}`
    })
  }

  return output
}

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

const run = async () => {
  const stat = await fs.stat(distDir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Dist directory not found: ${distDir}`)
  }

  const jsFiles = await walk(distDir)

  for (const filePath of jsFiles) {
    const content = await fs.readFile(filePath, 'utf8')
    const rewritten = rewriteImportSpecifiers(content)
    if (rewritten !== content) {
      await fs.writeFile(filePath, rewritten, 'utf8')
    }
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
