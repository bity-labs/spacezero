import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkStorybookRuntimeReferences } from './check-storybook-runtime-references.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('checkStorybookRuntimeReferences', () => {
  it('rejects direct preload bridge references in Storybook stories', async () => {
    const sourceDirectory = await createSourceDirectory()
    const storyPath = join(sourceDirectory, 'feature', 'mixed-view.stories.tsx')
    await mkdir(join(sourceDirectory, 'feature'), { recursive: true })
    await writeFile(
      storyPath,
      [
        'export const Direct = () => window.spacezero.projects.list()',
        '',
        "export const Bracket = () => window['spacezero'].projects.list()"
      ].join('\n'),
      'utf8'
    )

    await expect(checkStorybookRuntimeReferences({ sourceDirectory })).rejects.toThrow(
      [
        'Storybook stories must not reference window.spacezero.',
        '- feature/mixed-view.stories.tsx:1',
        '- feature/mixed-view.stories.tsx:3'
      ].join('\n')
    )
  })

  it('checks supported story files without scanning ordinary application files', async () => {
    const sourceDirectory = await createSourceDirectory()
    await writeFile(
      join(sourceDirectory, 'pure-view.stories.tsx'),
      'export const Default = {}',
      'utf8'
    )
    await writeFile(
      join(sourceDirectory, 'connected-container.tsx'),
      'export const loadProjects = () => window.spacezero.projects.list()',
      'utf8'
    )

    await expect(checkStorybookRuntimeReferences({ sourceDirectory })).resolves.toEqual({
      storyFilesChecked: 1
    })
  })
})

async function createSourceDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spacezero-storybook-check-'))
  temporaryDirectories.push(directory)
  return directory
}
