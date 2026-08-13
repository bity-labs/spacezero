import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getFilesWorkingDocument,
  resetFilesStore,
  useFilesStore
} from '../../files/renderer/files-store'
import type { FilesTextDocument } from '../../files/shared'
import { requestCloseGitDiffSidePaneTab } from './git-side-pane'

function textDocument(relativePath: string, content = 'saved'): FilesTextDocument {
  return {
    name: relativePath.split('/').at(-1) ?? relativePath,
    relativePath,
    contentKind: 'text',
    content,
    revision: `${relativePath}-revision`,
    size: content.length,
    modifiedAt: new Date(0).toISOString(),
    hasBom: false,
    lineEnding: 'lf'
  }
}

function openDirtyFilesTab(relativePath: string): void {
  const files = useFilesStore.getState()
  files.beginOpenTab('session-1', relativePath, 'permanent', 1)
  files.finishOpenTab('session-1', textDocument(relativePath), 1)
  files.updateWorkingDocumentDraft('session-1', relativePath, `${relativePath} dirty`)
}

function detachDirty(relativePath: string): void {
  const files = useFilesStore.getState()
  files.ensureWorkingDocument('session-1', textDocument(relativePath))
  files.updateWorkingDocumentDraft('session-1', relativePath, `${relativePath} dirty`)
}

describe('Git Diff Side Pane close safety', () => {
  beforeEach(() => {
    resetFilesStore()
    vi.restoreAllMocks()
  })

  it('does not prompt when every dirty document remains open in Files', async () => {
    openDirtyFilesTab('README.md')
    const prompt = vi.spyOn(window, 'prompt')

    await expect(
      requestCloseGitDiffSidePaneTab({
        filesContextKey: 'session-1',
        ipcContext: { kind: 'project-session', sessionId: 'session-1' }
      })
    ).resolves.toBe(true)

    expect(prompt).not.toHaveBeenCalled()
    expect(getFilesWorkingDocument('session-1', 'README.md')).toMatchObject({ dirty: true })
  })

  it('saves all orphaned dirty documents but keeps Git Diff open with per-file outcomes after a partial failure', async () => {
    detachDirty('one.txt')
    detachDirty('two.txt')
    vi.spyOn(window, 'prompt').mockReturnValue('save')
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    window.spacezero.files.saveDocument = vi.fn(async (request) => {
      if (request.relativePath === 'two.txt') throw new Error('disk full')
      return {
        status: 'saved' as const,
        document: {
          ...textDocument(request.relativePath, request.content),
          revision: `${request.relativePath}-saved-revision`
        }
      }
    })

    await expect(
      requestCloseGitDiffSidePaneTab({
        filesContextKey: 'session-1',
        ipcContext: { kind: 'project-session', sessionId: 'session-1' }
      })
    ).resolves.toBe(false)

    expect(window.spacezero.files.saveDocument).toHaveBeenCalledTimes(2)
    expect(getFilesWorkingDocument('session-1', 'one.txt')).toBeUndefined()
    expect(getFilesWorkingDocument('session-1', 'two.txt')).toMatchObject({
      dirty: true,
      saveStatus: 'error'
    })
    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/one\.txt: saved.*two\.txt: failed/s))
  })

  it('discards only orphaned dirty documents and leaves Files-owned dirty buffers untouched', async () => {
    detachDirty('orphan.txt')
    openDirtyFilesTab('visible.txt')
    vi.spyOn(window, 'prompt').mockReturnValue('discard')

    await expect(
      requestCloseGitDiffSidePaneTab({
        filesContextKey: 'session-1',
        ipcContext: { kind: 'project-session', sessionId: 'session-1' }
      })
    ).resolves.toBe(true)

    expect(getFilesWorkingDocument('session-1', 'orphan.txt')).toBeUndefined()
    expect(getFilesWorkingDocument('session-1', 'visible.txt')).toMatchObject({
      draft: 'visible.txt dirty',
      dirty: true
    })
  })

  it('cancels without changing orphaned dirty documents', async () => {
    detachDirty('draft.txt')
    vi.spyOn(window, 'prompt').mockReturnValue('cancel')

    await expect(
      requestCloseGitDiffSidePaneTab({
        filesContextKey: 'session-1',
        ipcContext: { kind: 'project-session', sessionId: 'session-1' }
      })
    ).resolves.toBe(false)

    expect(getFilesWorkingDocument('session-1', 'draft.txt')).toMatchObject({
      draft: 'draft.txt dirty',
      dirty: true
    })
  })
})
