#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const STORY_FILE_PATTERN = /\.stories\.(?:js|jsx|mjs|ts|tsx)$/
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
    const storyPath = toPortablePath(relative(sourceDirectory, storyFile))
    const metaTitle = findStaticMetaTitle(source, storyFile)

    if (metaTitle === undefined) {
      violations.push(`${storyPath}: missing a static Storybook title`)
      continue
    }

    const root = metaTitle.title.split('/')[0]

    if (FORBIDDEN_ROOTS.has(root)) {
      violations.push(`${storyPath}:${metaTitle.line}: forbidden catch-all root "${root}"`)
    } else if (!ALLOWED_ROOTS.has(root)) {
      violations.push(`${storyPath}:${metaTitle.line}: unsupported root "${root}"`)
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

function findStaticMetaTitle(source, storyFile) {
  const sourceFile = ts.createSourceFile(
    storyFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const defaultExport = sourceFile.statements.find(
    (statement) => ts.isExportAssignment(statement) && !statement.isExportEquals
  )
  const metaObject =
    defaultExport === undefined
      ? undefined
      : resolveObjectLiteral(defaultExport.expression, sourceFile, new Set())
  const titleProperty = metaObject?.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === 'title'
  )

  if (titleProperty === undefined || !ts.isPropertyAssignment(titleProperty)) {
    return undefined
  }

  const title = unwrapExpression(titleProperty.initializer)

  if (!ts.isStringLiteral(title)) {
    return undefined
  }

  return {
    title: title.text,
    line: sourceFile.getLineAndCharacterOfPosition(titleProperty.name.getStart(sourceFile)).line + 1
  }
}

function resolveObjectLiteral(expression, sourceFile, visitedIdentifiers) {
  const unwrappedExpression = unwrapExpression(expression)

  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression
  }

  if (!ts.isIdentifier(unwrappedExpression) || visitedIdentifiers.has(unwrappedExpression.text)) {
    return undefined
  }

  visitedIdentifiers.add(unwrappedExpression.text)

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue
    }

    const declaration = statement.declarationList.declarations.find(
      (candidate) =>
        ts.isIdentifier(candidate.name) && candidate.name.text === unwrappedExpression.text
    )

    if (declaration?.initializer !== undefined) {
      return resolveObjectLiteral(declaration.initializer, sourceFile, visitedIdentifiers)
    }
  }

  return undefined
}

function unwrapExpression(expression) {
  let current = expression

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }

  return current
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
