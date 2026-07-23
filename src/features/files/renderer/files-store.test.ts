import { describe, expect, it } from 'vitest'

import { useFilesStore } from './files-store'

describe('Files renderer state', () => {
  it('keeps explorer layout, selection, and expansion independent per Project Session', () => {
    const store = useFilesStore.getState()
    store.setExplorerWidth('session-1', 280)
    store.setExplorerCollapsed('session-1', true)
    store.setSelectedPath('session-1', 'src/one.ts')
    store.setExpanded('session-1', 'src', true)

    store.setExplorerWidth('session-2', 360)
    store.setSelectedPath('session-2', 'README.md')

    expect(useFilesStore.getState().contexts).toMatchObject({
      'session-1': {
        explorerWidth: 280,
        explorerCollapsed: true,
        selectedPath: 'src/one.ts',
        expandedPaths: ['src']
      },
      'session-2': {
        explorerWidth: 360,
        explorerCollapsed: false,
        selectedPath: 'README.md',
        expandedPaths: []
      }
    })
  })

  it('keeps dirty editor buffers in memory per Project Session without persisting them', async () => {
    useFilesStore.getState().setActiveDocument('session-1', {
      status: 'ready',
      relativePath: 'src/index.ts',
      name: 'index.ts',
      contentKind: 'text',
      content: 'saved',
      draft: 'saved',
      revision: 'revision-1',
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      hasBom: false,
      lineEnding: 'lf',
      dirty: false,
      saveStatus: 'idle'
    })
    useFilesStore.getState().updateDraft('session-1', 'draft')

    expect(useFilesStore.getState().contexts['session-1'].activeDocument).toMatchObject({
      draft: 'draft',
      dirty: true
    })
    expect(window.localStorage.getItem('spacezero.files')).not.toContain('draft')
  })

  it('preserves edits made after a save request while updating the saved baseline', () => {
    const store = useFilesStore.getState()
    store.setActiveDocument('session-1', {
      status: 'ready',
      relativePath: 'src/index.ts',
      name: 'index.ts',
      contentKind: 'text',
      content: 'saved',
      draft: 'first draft',
      revision: 'revision-1',
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      hasBom: false,
      lineEnding: 'lf',
      dirty: true,
      saveStatus: 'idle'
    })
    const request = {
      relativePath: 'src/index.ts',
      content: 'first draft',
      expectedRevision: 'revision-1'
    }

    store.markSaving('session-1', request)
    store.updateDraft('session-1', 'newer draft')
    store.markSaved(
      'session-1',
      {
        name: 'index.ts',
        relativePath: 'src/index.ts',
        contentKind: 'text',
        content: 'first draft',
        revision: 'revision-2',
        size: 11,
        modifiedAt: new Date(1).toISOString(),
        hasBom: false,
        lineEnding: 'lf'
      },
      request
    )

    expect(useFilesStore.getState().contexts['session-1'].activeDocument).toMatchObject({
      content: 'first draft',
      draft: 'newer draft',
      revision: 'revision-2',
      dirty: true,
      saveStatus: 'idle'
    })
  })

  it('preserves edits made after a failed save request', () => {
    const store = useFilesStore.getState()
    store.setActiveDocument('session-1', {
      status: 'ready',
      relativePath: 'src/index.ts',
      name: 'index.ts',
      contentKind: 'text',
      content: 'saved',
      draft: 'first draft',
      revision: 'revision-1',
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      hasBom: false,
      lineEnding: 'lf',
      dirty: true,
      saveStatus: 'idle'
    })
    const request = {
      relativePath: 'src/index.ts',
      content: 'first draft',
      expectedRevision: 'revision-1'
    }

    store.markSaving('session-1', request)
    store.updateDraft('session-1', 'newer draft')
    store.markSaveFailed('session-1', 'save failed', request)

    expect(useFilesStore.getState().contexts['session-1'].activeDocument).toMatchObject({
      draft: 'newer draft',
      dirty: true,
      saveStatus: 'error',
      error: 'save failed'
    })
  })

  it('ignores save results and failures for a different active document', () => {
    const store = useFilesStore.getState()
    const request = {
      relativePath: 'src/one.ts',
      content: 'first draft',
      expectedRevision: 'revision-1'
    }
    store.setActiveDocument('session-1', {
      status: 'ready',
      relativePath: 'src/one.ts',
      name: 'one.ts',
      contentKind: 'text',
      content: 'saved',
      draft: 'first draft',
      revision: 'revision-1',
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      hasBom: false,
      lineEnding: 'lf',
      dirty: true,
      saveStatus: 'idle'
    })
    store.markSaving('session-1', request)
    store.setActiveDocument('session-1', {
      status: 'ready',
      relativePath: 'src/two.ts',
      name: 'two.ts',
      contentKind: 'text',
      content: 'two saved',
      draft: 'two draft',
      revision: 'revision-two',
      size: 9,
      modifiedAt: new Date(0).toISOString(),
      hasBom: false,
      lineEnding: 'lf',
      dirty: true,
      saveStatus: 'idle'
    })

    store.markSaveFailed('session-1', 'failed old save', request)
    store.markSaved(
      'session-1',
      {
        name: 'one.ts',
        relativePath: 'src/one.ts',
        contentKind: 'text',
        content: 'first draft',
        revision: 'revision-2',
        size: 11,
        modifiedAt: new Date(1).toISOString(),
        hasBom: false,
        lineEnding: 'lf'
      },
      request
    )

    expect(useFilesStore.getState().contexts['session-1'].activeDocument).toMatchObject({
      relativePath: 'src/two.ts',
      draft: 'two draft'
    })
  })

  it('restores each Project Session explorer width and collapsed state', async () => {
    useFilesStore.getState().setExplorerWidth('session-1', 320)
    useFilesStore.getState().setExplorerCollapsed('session-1', true)
    const persisted = window.localStorage.getItem('spacezero.files')
    expect(persisted).toContain('"explorerWidth":320')

    useFilesStore.setState({ contexts: {} })
    window.localStorage.setItem('spacezero.files', persisted!)
    await useFilesStore.persist.rehydrate()

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      explorerWidth: 320,
      explorerCollapsed: true
    })
  })
})
