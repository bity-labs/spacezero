import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkStorybookTaxonomy } from './check-storybook-taxonomy.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('checkStorybookTaxonomy', () => {
  it('accepts intent-based story roots', async () => {
    const sourceDirectory = await createSourceDirectory()
    await writeFile(
      join(sourceDirectory, 'workspace.stories.tsx'),
      "export default { title: 'Layouts/Workspace' }",
      'utf8'
    )
    await writeFile(
      join(sourceDirectory, 'button.stories.tsx'),
      "export default { title: 'Design System/Primitives/Button' }",
      'utf8'
    )

    await expect(checkStorybookTaxonomy({ sourceDirectory })).resolves.toEqual({
      storyFilesChecked: 2
    })
  })

  it('rejects Smoke and unknown catch-all roots with file diagnostics', async () => {
    const sourceDirectory = await createSourceDirectory()
    await mkdir(join(sourceDirectory, 'feature'), { recursive: true })
    await writeFile(
      join(sourceDirectory, 'feature', 'legacy.stories.tsx'),
      "export default { title: 'Smoke/Legacy' }",
      'utf8'
    )
    await writeFile(
      join(sourceDirectory, 'feature', 'experiment.stories.tsx'),
      "export default { title: 'Experiments/New Thing' }",
      'utf8'
    )

    await expect(checkStorybookTaxonomy({ sourceDirectory })).rejects.toThrow(
      [
        'Storybook stories must use the intent-based taxonomy.',
        '- feature/experiment.stories.tsx:1: unsupported root "Experiments"',
        '- feature/legacy.stories.tsx:1: forbidden catch-all root "Smoke"'
      ].join('\n')
    )
  })

  it('rejects story files without a static title', async () => {
    const sourceDirectory = await createSourceDirectory()
    await writeFile(
      join(sourceDirectory, 'untitled.stories.tsx'),
      'export default { component: Example }',
      'utf8'
    )

    await expect(checkStorybookTaxonomy({ sourceDirectory })).rejects.toThrow(
      '- untitled.stories.tsx: missing a static Storybook title'
    )
  })
})

async function createSourceDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spacezero-storybook-taxonomy-'))
  temporaryDirectories.push(directory)
  return directory
}
