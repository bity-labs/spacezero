import { describe, expect, it } from 'vitest'

import { useFilesStore } from './files-store'
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


  it('defaults lossless Markdown and MDX tabs to rich mode and keeps lossy documents in source mode', () => {
    const store = useFilesStore.getState()

    expect(store.beginOpenTab('session-1', 'README.md', 'preview', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('README.md', '# Safe'), 1)
    expect(store.beginOpenTab('session-1', 'docs/page.mdx', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('docs/page.mdx', '# Page'), 2)
    expect(store.beginOpenTab('session-1', 'docs/lossy.mdx', 'permanent', 3)).toBe(true)
    store.finishOpenTab('session-1', textDocument('docs/lossy.mdx', `import X from './x'\n\n# Page`), 3)

    expect(useFilesStore.getState().contexts['session-1'].tabs).toMatchObject([
      { relativePath: 'README.md', editorMode: 'rich' },
      { relativePath: 'docs/page.mdx', editorMode: 'rich' },
      { relativePath: 'docs/lossy.mdx', editorMode: 'source' }
    ])
  })

  it('stores editor mode with the tab without sharing it across Project Sessions', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'README.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('README.md', '# One'), 1)
    expect(store.beginOpenTab('session-2', 'README.md', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-2', textDocument('README.md', '# Two'), 2)

    store.setEditorMode('session-1', 'README.md', 'source')

    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      editorMode: 'source'
    })
    expect(useFilesStore.getState().contexts['session-2'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      editorMode: 'rich'
    })
  })

  it('replaces one clean preview tab when browsing files', () => {
    const store = useFilesStore.getState()

    expect(store.beginOpenTab('session-1', 'one.txt', 'preview', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('one.txt'), 1)
    expect(store.beginOpenTab('session-1', 'two.txt', 'preview', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('two.txt'), 2)

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'two.txt',
      selectedPath: 'two.txt',
      tabs: [{ relativePath: 'two.txt', preview: true, status: 'ready' }]
    })
  })

  it('promotes previews by double-clicking, editing, saving, or explicit pinning', () => {
    const store = useFilesStore.getState()

    expect(store.beginOpenTab('session-1', 'double-clicked.txt', 'preview', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('double-clicked.txt'), 1)
    expect(store.beginOpenTab('session-1', 'double-clicked.txt', 'permanent', 2)).toBe(false)
    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      relativePath: 'double-clicked.txt',
      preview: false
    })

    expect(store.beginOpenTab('session-1', 'edited.txt', 'preview', 3)).toBe(true)
    store.finishOpenTab('session-1', textDocument('edited.txt'), 3)
    store.updateDraft('session-1', 'edited draft')
    expect(useFilesStore.getState().contexts['session-1'].tabs.at(-1)).toMatchObject({
      relativePath: 'edited.txt',
      preview: false,
      dirty: true
    })

    expect(store.beginOpenTab('session-1', 'saved.txt', 'preview', 4)).toBe(true)
    store.finishOpenTab('session-1', textDocument('saved.txt'), 4)
    const saveRequest = {
      relativePath: 'saved.txt',
      content: 'saved.txt saved',
      expectedRevision: 'saved.txt-revision'
    }
    store.markSaving('session-1', saveRequest)
    store.markSaved('session-1', textDocument('saved.txt', 'saved.txt saved'), saveRequest)
    expect(useFilesStore.getState().contexts['session-1'].tabs.at(-1)).toMatchObject({
      relativePath: 'saved.txt',
      preview: false,
      dirty: false
    })

    expect(store.beginOpenTab('session-1', 'pinned.txt', 'preview', 5)).toBe(true)
    store.finishOpenTab('session-1', textDocument('pinned.txt'), 5)
    store.promoteTab('session-1', 'pinned.txt')
    expect(useFilesStore.getState().contexts['session-1'].tabs.at(-1)).toMatchObject({
      relativePath: 'pinned.txt',
      preview: false
    })
  })

  it('activates an existing tab instead of creating a duplicate', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'one.txt', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('one.txt'), 1)
    expect(store.beginOpenTab('session-1', 'two.txt', 'preview', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('two.txt'), 2)

    expect(store.beginOpenTab('session-1', 'one.txt', 'preview', 3)).toBe(false)

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'one.txt',
      tabs: [{ relativePath: 'one.txt' }, { relativePath: 'two.txt' }]
    })
  })

  it('keeps dirty tabs permanent and protected from preview replacement', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'draft.txt', 'preview', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('draft.txt'), 1)
    store.updateDraft('session-1', 'draft text')

    expect(store.beginOpenTab('session-1', 'browse.txt', 'preview', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('browse.txt'), 2)

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'browse.txt',
      tabs: [
        { relativePath: 'draft.txt', preview: false, dirty: true, draft: 'draft text' },
        { relativePath: 'browse.txt', preview: true, dirty: false }
      ]
    })
  })

  it('reorders tabs forward, backward, and to the final position', () => {
    const store = useFilesStore.getState()
    for (const [index, path] of ['one.txt', 'two.txt', 'three.txt'].entries()) {
      expect(store.beginOpenTab('session-1', path, 'permanent', index + 1)).toBe(true)
      store.finishOpenTab('session-1', textDocument(path), index + 1)
    }

    store.reorderTabs('session-1', 'one.txt', 'two.txt', 'after')
    expect(useFilesStore.getState().contexts['session-1'].tabs.map((tab) => tab.relativePath)).toEqual([
      'two.txt',
      'one.txt',
      'three.txt'
    ])

    store.reorderTabs('session-1', 'three.txt', 'two.txt', 'before')
    expect(useFilesStore.getState().contexts['session-1'].tabs.map((tab) => tab.relativePath)).toEqual([
      'three.txt',
      'two.txt',
      'one.txt'
    ])

    store.reorderTabs('session-1', 'three.txt', 'one.txt', 'after')
    expect(useFilesStore.getState().contexts['session-1'].tabs.map((tab) => tab.relativePath)).toEqual([
      'two.txt',
      'one.txt',
      'three.txt'
    ])
  })

  it('deterministically selects neighbors when clean tabs close', () => {
    const store = useFilesStore.getState()
    for (const [index, path] of ['one.txt', 'two.txt', 'three.txt'].entries()) {
      expect(store.beginOpenTab('session-1', path, 'permanent', index + 1)).toBe(true)
      store.finishOpenTab('session-1', textDocument(path), index + 1)
    }

    store.reorderTabs('session-1', 'three.txt', 'one.txt', 'before')

    store.activateTab('session-1', 'one.txt')
    store.closeTab('session-1', 'one.txt')
    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'two.txt',
      tabs: [{ relativePath: 'three.txt' }, { relativePath: 'two.txt' }]
    })

    store.closeTab('session-1', 'two.txt')
    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'three.txt',
      tabs: [{ relativePath: 'three.txt' }]
    })
  })

  it('keeps dirty editor buffers in memory per Project Session without persisting them', async () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'src/index.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/index.ts', 'saved'), 1)
    store.updateDraft('session-1', 'draft')

    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      draft: 'draft',
      dirty: true
    })
    expect(window.localStorage.getItem('spacezero.files')).not.toContain('draft')
  })

  it('preserves edits made after a save request while updating the saved baseline', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'src/index.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/index.ts', 'saved'), 1)
    store.updateDraft('session-1', 'first draft')
    const request = {
      relativePath: 'src/index.ts',
      content: 'first draft',
      expectedRevision: 'src/index.ts-revision'
    }

    store.markSaving('session-1', request)
    store.updateDraft('session-1', 'newer draft')
    store.markSaved('session-1', textDocument('src/index.ts', 'first draft'), request)

    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      content: 'first draft',
      draft: 'newer draft',
      dirty: true,
      saveStatus: 'idle'
    })
  })

  it('preserves edits made after a failed save request', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'src/index.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/index.ts', 'saved'), 1)
    store.updateDraft('session-1', 'first draft')
    const request = {
      relativePath: 'src/index.ts',
      content: 'first draft',
      expectedRevision: 'src/index.ts-revision'
    }

    store.markSaving('session-1', request)
    store.updateDraft('session-1', 'newer draft')
    store.markSaveFailed('session-1', 'save failed', request)

    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      draft: 'newer draft',
      dirty: true,
      saveStatus: 'error',
      error: 'save failed'
    })
  })

  it('marks an inactive dirty tab as saving so Save All can settle per-file outcomes', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'src/one.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/one.ts', 'saved'), 1)
    store.updateDraft('session-1', 'first draft')
    expect(store.beginOpenTab('session-1', 'src/two.ts', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/two.ts', 'two saved'), 2)
    store.updateDraft('session-1', 'two draft')

    store.markSaving('session-1', {
      relativePath: 'src/one.ts',
      content: 'first draft',
      expectedRevision: 'src/one.ts-revision'
    })

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'src/two.ts',
      tabs: [
        { relativePath: 'src/one.ts', saveStatus: 'saving', preview: false },
        { relativePath: 'src/two.ts', saveStatus: 'idle' }
      ]
    })
  })

  it('settles a saved tab after switching to another active document', () => {
    const store = useFilesStore.getState()
    const request = {
      relativePath: 'src/one.ts',
      content: 'first draft',
      expectedRevision: 'src/one.ts-revision'
    }
    expect(store.beginOpenTab('session-1', 'src/one.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/one.ts', 'saved'), 1)
    store.updateDraft('session-1', 'first draft')
    store.markSaving('session-1', request)
    expect(store.beginOpenTab('session-1', 'src/two.ts', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/two.ts', 'two saved'), 2)
    store.updateDraft('session-1', 'two draft')

    store.markSaved('session-1', textDocument('src/one.ts', 'first draft'), request)

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'src/two.ts',
      tabs: [
        { relativePath: 'src/one.ts', draft: 'first draft', dirty: false, saveStatus: 'idle' },
        { relativePath: 'src/two.ts', draft: 'two draft' }
      ]
    })
  })

  it('settles a failed save after switching to another active document', () => {
    const store = useFilesStore.getState()
    const request = {
      relativePath: 'src/one.ts',
      content: 'first draft',
      expectedRevision: 'src/one.ts-revision'
    }
    expect(store.beginOpenTab('session-1', 'src/one.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/one.ts', 'saved'), 1)
    store.updateDraft('session-1', 'first draft')
    store.markSaving('session-1', request)
    expect(store.beginOpenTab('session-1', 'src/two.ts', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/two.ts', 'two saved'), 2)
    store.updateDraft('session-1', 'two draft')

    store.markSaveFailed('session-1', 'failed old save', request)

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'src/two.ts',
      tabs: [
        {
          relativePath: 'src/one.ts',
          draft: 'first draft',
          dirty: true,
          saveStatus: 'error',
          error: 'failed old save'
        },
        { relativePath: 'src/two.ts', draft: 'two draft' }
      ]
    })
  })

  it('restores each Project Session explorer width and collapsed state without restoring tabs', async () => {
    const store = useFilesStore.getState()
    store.setExplorerWidth('session-1', 320)
    store.setExplorerCollapsed('session-1', true)
    expect(store.beginOpenTab('session-1', 'src/index.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/index.ts'), 1)
    const persisted = window.localStorage.getItem('spacezero.files')
    expect(persisted).toContain('"explorerWidth":320')
    expect(persisted).not.toContain('src/index.ts saved')

    useFilesStore.setState({ contexts: {} })
    window.localStorage.setItem('spacezero.files', persisted!)
    await useFilesStore.persist.rehydrate()

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      explorerWidth: 320,
      explorerCollapsed: true,
      tabs: [],
      activeTabPath: null
    })
  })
})
