#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const STORY_FILE_PATTERN = /\.stories\.(?:js|jsx|mjs|ts|tsx)$/
const STATIC_TITLE_PATTERN = /\btitle\s*:\s*(['"])([^'"]+)\1/g
const FORBIDDEN_ROOTS = new Set(['Smoke'])
const ALLOWED_ROOTS = new Set([
  'Design System',
  'App Shell',
  'Settings',
  'Projects',
  'GitHub',
  'Chat',
  'Side Pane',
  'Files',
  'Git',
  'Browser',
  'Terminal',
  'Knowledge Base',
  'Onboarding',
  'Screens',
  'Layouts'
])

export async function checkStorybookTaxonomy({ sourceDirectory = resolve('src') } = {}) {
  const storyFiles = await findStoryFiles(sourceDirectory)
  const violations = []

  for (const storyFile of storyFiles) {
    const source = await readFile(storyFile, 'utf8')
    const matches = [...source.matchAll(STATIC_TITLE_PATTERN)]
    const storyPath = toPortablePath(relative(sourceDirectory, storyFile))

    if (matches.length === 0) {
      violations.push(`${storyPath}: missing a static Storybook title`)
      continue
    }

    const [metaTitle] = matches
    const title = metaTitle[2]
    const root = title.split('/')[0]
    const line = source.slice(0, metaTitle.index).split(/\r?\n/).length

    if (FORBIDDEN_ROOTS.has(root)) {
      violations.push(`${storyPath}:${line}: forbidden catch-all root "${root}"`)
    } else if (!ALLOWED_ROOTS.has(root)) {
      violations.push(`${storyPath}:${line}: unsupported root "${root}"`)
    }
  }

  if (violations.length > 0) {
    throw new Error(
      [
        'Storybook stories must use the intent-based taxonomy.',
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
  const result = await checkStorybookTaxonomy()
  process.stdout.write(
    `Checked ${result.storyFilesChecked} Storybook story files; all use the intent-based taxonomy.\n`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
