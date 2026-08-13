import { beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmFilesExit } from './files-exit-guard'
import { resetFilesStore, useFilesStore } from './files-store'
import type { FilesTextDocument } from '../shared'

function textDocument(relativePath: string, content = `${relativePath} saved`): FilesTextDocument {
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

function openDirty(contextKey: string, relativePath: string, content = 'saved'): void {
  const store = useFilesStore.getState()
  const requestId = Date.now()
  expect(store.beginOpenTab(contextKey, relativePath, 'permanent', requestId)).toBe(true)
  store.finishOpenTab(contextKey, textDocument(relativePath, content), requestId)
  store.activateTab(contextKey, relativePath)
  store.updateDraft(contextKey, `${content} draft`)
}

describe('Files exit guard', () => {
  beforeEach(() => {
    resetFilesStore()
    vi.restoreAllMocks()
  })

  it('cancels quit without mutating dirty buffers when the aggregate choice is cancel', async () => {
    openDirty('session-1', 'src/one.ts')
    vi.spyOn(window, 'prompt').mockReturnValue('cancel')
    const saveDocument = vi.spyOn(window.spacezero.files, 'saveDocument')

    await expect(confirmFilesExit()).resolves.toBe(false)

    expect(saveDocument).not.toHaveBeenCalled()
    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      dirty: true,
      draft: 'saved draft'
    })
  })

  it('protects and saves a dirty document edited only through Git Diff on quit', async () => {
    const files = useFilesStore.getState()
    files.ensureWorkingDocument('session-1', textDocument('diff-only.ts', 'saved'))
    files.updateWorkingDocumentDraft('session-1', 'diff-only.ts', 'dirty draft')
    vi.spyOn(window, 'prompt').mockReturnValue('save')
    const saveDocument = vi
      .spyOn(window.spacezero.files, 'saveDocument')
      .mockImplementation(async (request) => ({
        status: 'saved',
        document: textDocument(request.relativePath, request.content)
      }))

    await expect(confirmFilesExit()).resolves.toBe(true)

    expect(saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-session', sessionId: 'session-1' },
      relativePath: 'diff-only.ts',
      content: 'dirty draft',
      expectedRevision: 'diff-only.ts-revision'
    })
    expect(
      useFilesStore.getState().contexts['session-1'].detachedDocuments['diff-only.ts']
    ).toMatchObject({
      dirty: false
    })
  })

  it('saves a dirty Project Home document through its typed project identity and allows quit', async () => {
    openDirty('project:project-1', 'src/project.ts', 'project')
    vi.spyOn(window, 'prompt').mockReturnValue('save')
    const saveDocument = vi
      .spyOn(window.spacezero.files, 'saveDocument')
      .mockImplementation(async (request) => ({
        status: 'saved',
        document: textDocument(request.relativePath, request.content)
      }))

    await expect(confirmFilesExit()).resolves.toBe(true)

    expect(saveDocument).toHaveBeenCalledWith({
      context: { kind: 'project-home', projectId: 'project-1' },
      relativePath: 'src/project.ts',
      content: 'project draft',
      expectedRevision: 'src/project.ts-revision'
    })
    expect(useFilesStore.getState().contexts['project:project-1'].tabs[0]).toMatchObject({
      dirty: false
    })
  })

  it('saves dirty files across affected contexts and blocks quit with remaining dirty paths on failures', async () => {
    openDirty('session-1', 'src/one.ts', 'one')
    openDirty('knowledge-base', 'notes/two.md', 'two')
    vi.spyOn(window, 'prompt').mockReturnValue('save')
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    vi.spyOn(window.spacezero.files, 'saveDocument').mockImplementation(async (request) => {
      if (request.relativePath === 'notes/two.md') throw new Error('disk full')
      return { status: 'saved', document: textDocument(request.relativePath, request.content) }
    })

    await expect(confirmFilesExit()).resolves.toBe(false)

    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({ dirty: false })
    expect(useFilesStore.getState().contexts['knowledge-base'].tabs[0]).toMatchObject({
      dirty: true,
      saveStatus: 'error'
    })
    expect(alert.mock.calls[0]?.[0]).toContain('knowledge-base: notes/two.md')
  })

  it('waits for in-flight dirty saves to settle and blocks quit with the failed path', async () => {
    openDirty('session-1', 'README.md', 'saved')
    const request = {
      relativePath: 'README.md',
      content: 'saved draft',
      expectedRevision: 'README.md-revision'
    }
    useFilesStore.getState().markSaving('session-1', request)
    vi.spyOn(window, 'prompt').mockReturnValue('save')
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    const saveDocument = vi.spyOn(window.spacezero.files, 'saveDocument')

    const result = confirmFilesExit()
    await Promise.resolve()

    expect(saveDocument).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()

    useFilesStore.getState().markSaveFailed('session-1', 'Couldn’t save this file.', request)

    await expect(result).resolves.toBe(false)
    expect(alert.mock.calls[0]?.[0]).toContain('session-1: README.md')
  })

  it('discards dirty buffers across contexts when the aggregate choice is discard', async () => {
    openDirty('session-1', 'src/one.ts', 'one')
    openDirty('session-2', 'src/two.ts', 'two')
    vi.spyOn(window, 'prompt').mockReturnValue('discard')

    await expect(confirmFilesExit()).resolves.toBe(true)

    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      dirty: false,
      draft: 'one'
    })
    expect(useFilesStore.getState().contexts['session-2'].tabs[0]).toMatchObject({
      dirty: false,
      draft: 'two'
    })
  })
})
