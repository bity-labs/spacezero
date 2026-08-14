#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const STORY_FILE_PATTERN = /\.stories\.(?:js|jsx|mjs|ts|tsx)$/
const FORBIDDEN_RUNTIME_REFERENCE_PATTERN =
  /\bwindow\s*(?:\.\s*spacezero|\[\s*(['"])spacezero\1\s*\])/

export async function checkStorybookRuntimeReferences({ sourceDirectory = resolve('src') } = {}) {
  const storyFiles = await findStoryFiles(sourceDirectory)
  const violations = []

  for (const storyFile of storyFiles) {
    const source = await readFile(storyFile, 'utf8')
    const lines = source.split(/\r?\n/)

    lines.forEach((line, index) => {
      if (FORBIDDEN_RUNTIME_REFERENCE_PATTERN.test(line)) {
        violations.push(`${toPortablePath(relative(sourceDirectory, storyFile))}:${index + 1}`)
      }
    })
  }

  if (violations.length > 0) {
    throw new Error(
      [
        'Storybook stories must not reference window.spacezero.',
        ...violations.map((item) => `- ${item}`)
      ].join('\n')
    )
  }

  return { storyFilesChecked: storyFiles.length }
}

async function findStoryFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await findStoryFiles(entryPath)))
    } else if (entry.isFile() && STORY_FILE_PATTERN.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

function toPortablePath(path) {
  return path.split(sep).join('/')
}

async function main() {
  const result = await checkStorybookRuntimeReferences()
  process.stdout.write(
    `Checked ${result.storyFilesChecked} Storybook story files; no forbidden window.spacezero references found.\n`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
