#!/usr/bin/env node
const { readdir, rm } = require('node:fs/promises')
const { join } = require('node:path')
const process = require('node:process')

async function prunePackagedSourceMaps(contextOrDirectory) {
  const appOutDir =
    typeof contextOrDirectory === 'string'
      ? contextOrDirectory
      : typeof contextOrDirectory?.appOutDir === 'string'
        ? contextOrDirectory.appOutDir
        : null

  if (!appOutDir) {
    throw new Error('Packaged app output directory is required to prune source maps.')
  }

  return pruneSourceMapsInDirectory(appOutDir)
}

async function pruneSourceMapsInDirectory(directory) {
  let removed = 0
  const entries = await readdir(directory, { withFileTypes: true })

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        removed += await pruneSourceMapsInDirectory(entryPath)
        return
      }

      if (entry.isFile() && entry.name.endsWith('.map')) {
        await rm(entryPath, { force: true })
        removed += 1
      }
    })
  )

  return removed
}

module.exports = prunePackagedSourceMaps
module.exports.prunePackagedSourceMaps = prunePackagedSourceMaps

async function main() {
  const directory = process.argv[2]
  const removed = await prunePackagedSourceMaps(directory)
  process.stdout.write(`Pruned ${removed} packaged source map${removed === 1 ? '' : 's'}.\n`)
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
