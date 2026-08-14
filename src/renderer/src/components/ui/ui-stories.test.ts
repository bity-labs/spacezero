import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const uiDirectory = dirname(fileURLToPath(import.meta.url))
const sourceFiles = readdirSync(uiDirectory)
  .filter(
    (fileName) =>
      fileName.endsWith('.tsx') &&
      !fileName.endsWith('.stories.tsx') &&
      !fileName.endsWith('.test.tsx')
  )
  .sort()

const agentChatComponentStories = new Set([
  'conversation',
  'message',
  'model-selector',
  'prompt-input',
  'reasoning',
  'tool'
])

const forbiddenRuntimeReferences = [
  'window.spacezero',
  'electron',
  'ipcRenderer',
  'better-sqlite3',
  'node:fs',
  'node:child_process'
]

describe('design-system UI stories', () => {
  it.each(sourceFiles)('%s has a co-located basic Storybook story', (sourceFile) => {
    const baseName = basename(sourceFile, '.tsx')
    const storyPath = join(uiDirectory, `${baseName}.stories.tsx`)
    const storySource = readFileSync(storyPath, 'utf8')
    const expectedTitlePrefix = agentChatComponentStories.has(baseName)
      ? `title: 'Design System/Components/Agent Chat/`
      : `title: 'Design System/Primitives/`

    expect(storySource).toContain(expectedTitlePrefix)
    expect(storySource).toMatch(
      new RegExp(`from ['"](?:\\./${baseName}|@renderer/components/ui/${baseName})['"]`)
    )

    for (const forbiddenReference of forbiddenRuntimeReferences) {
      expect(storySource).not.toContain(forbiddenReference)
    }
  })
})
