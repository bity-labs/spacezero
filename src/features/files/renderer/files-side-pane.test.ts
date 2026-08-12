import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetSidePaneStore, useSidePaneStore } from '../../side-pane/renderer'
import type { FilesTextDocument } from '../shared'
import { resetFilesStore, useFilesStore } from './files-store'
import { requestCloseFilesSidePaneTab, synchronizeFilesSidePaneTabs } from './files-side-pane'

function textDocument(relativePath: string): FilesTextDocument {
  return {
    name: relativePath.split('/').at(-1) ?? relativePath,
    relativePath,
    contentKind: 'text',
    content: relativePath,
    revision: `${relativePath}:revision`,
    size: relativePath.length,
    modifiedAt: new Date(0).toISOString(),
    hasBom: false,
    lineEnding: 'lf'
  }
}

describe('Files Side Pane coordination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    resetFilesStore()
    resetSidePaneStore()
  })

  it('keeps a dirty Files tab open with an actionable error when Save and close fails', async () => {
    const files = useFilesStore.getState()
    files.beginOpenTab('session-1', 'README.md', 'permanent', 1)
    files.finishOpenTab('session-1', textDocument('README.md'), 1)
    files.updateDraft('session-1', 'changed')
    vi.spyOn(window, 'prompt').mockReturnValue('save')
    window.spacezero.files.saveDocument = vi.fn(async () => {
      throw new Error('disk unavailable')
    })

    const canClose = await requestCloseFilesSidePaneTab({
      filesContextKey: 'session-1',
      ipcContext: { kind: 'project-session', sessionId: 'session-1' },
      tab: {
        id: 'files:README.md',
        categoryId: 'files',
        resourceId: 'README.md'
      }
    })

    expect(canClose).toBe(false)
    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      dirty: true,
      saveStatus: 'error',
      error: 'Couldn’t save this file. Your changes are still in memory.'
    })
  })

  it('discards a dirty Files document only after an explicit close choice', async () => {
    const files = useFilesStore.getState()
    files.beginOpenTab('session-1', 'README.md', 'permanent', 1)
    files.finishOpenTab('session-1', textDocument('README.md'), 1)
    files.updateDraft('session-1', 'changed')
    vi.spyOn(window, 'prompt').mockReturnValue('discard')

    const canClose = await requestCloseFilesSidePaneTab({
      filesContextKey: 'session-1',
      ipcContext: { kind: 'project-session', sessionId: 'session-1' },
      tab: {
        id: 'files:README.md',
        categoryId: 'files',
        resourceId: 'README.md'
      }
    })

    expect(canClose).toBe(true)
    expect(useFilesStore.getState().contexts['session-1'].tabs).toEqual([])
  })

  it('represents the empty Files surface and each document in the peer Side Pane tab order', () => {
    const sidePane = useSidePaneStore.getState()
    const files = useFilesStore.getState()
    sidePane.openCategory('session:session-1', 'files')
    sidePane.openCategory('session:session-1', 'browser')

    expect(useSidePaneStore.getState().contexts['session:session-1'].tabs).toEqual([
      { id: 'files:1', categoryId: 'files' },
      { id: 'browser:1', categoryId: 'browser' }
    ])

    files.beginOpenTab('session-1', 'README.md', 'preview', 1)
    files.finishOpenTab('session-1', textDocument('README.md'), 1)
    synchronizeFilesSidePaneTabs('session-1', 'session:session-1', true)

    expect(useSidePaneStore.getState().contexts['session:session-1']).toMatchObject({
      activeTabId: 'files:README.md',
      tabs: [
        {
          id: 'files:README.md',
          categoryId: 'files',
          resourceId: 'README.md',
          label: 'README.md',
          preview: true,
          dirty: false
        },
        { id: 'browser:1', categoryId: 'browser' }
      ]
    })

    files.beginOpenTab('session-1', 'src/index.ts', 'preview', 2)
    files.finishOpenTab('session-1', textDocument('src/index.ts'), 2)
    synchronizeFilesSidePaneTabs('session-1', 'session:session-1', true)

    expect(
      useSidePaneStore
        .getState()
        .contexts['session:session-1'].tabs.map(
          (tab) => `${tab.categoryId}:${tab.resourceId ?? ''}`
        )
    ).toEqual(['files:src/index.ts', 'browser:'])

    files.updateDraft('session-1', 'changed')
    synchronizeFilesSidePaneTabs('session-1', 'session:session-1', false)

    expect(useSidePaneStore.getState().contexts['session:session-1'].tabs[0]).toMatchObject({
      resourceId: 'src/index.ts',
      preview: false,
      dirty: true
    })
  })
})
