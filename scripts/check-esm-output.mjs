import { promises as fs } from 'node:fs'
import path from 'node:path'

const distDirs = process.argv.slice(2)

if (distDirs.length === 0) {
  console.error('Usage: node scripts/check-esm-output.mjs <dist-dir> [...]')
  process.exit(1)
}

const patterns = [
  /(from\s+['"])([^'"]+)(['"])/g,
  /(import\s+['"])([^'"]+)(['"])/g,
  /(import\(\s*['"])([^'"]+)(['"]\s*\))/g,
]

const relativeSpecifierNeedsExtension = (specifier) => {
  if (!specifier.startsWith('.')) return false
  const bare = specifier.split(/[?#]/, 1)[0]
  return bare.endsWith('/') || path.extname(bare) === ''
}

const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
    } else if (
      entry.isFile()
      && (fullPath.endsWith('.js') || fullPath.endsWith('.d.ts'))
    ) {
      files.push(fullPath)
    }
  }
  return files
}

const failures = []
for (const distArg of distDirs) {
  const distDir = path.resolve(process.cwd(), distArg)
  const files = await walk(distDir)
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8')
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      for (const match of content.matchAll(pattern)) {
        const specifier = match[2]
        if (specifier && relativeSpecifierNeedsExtension(specifier)) {
          failures.push(`${path.relative(process.cwd(), filePath)}: ${specifier}`)
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Extensionless relative ESM specifiers found in package output:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
