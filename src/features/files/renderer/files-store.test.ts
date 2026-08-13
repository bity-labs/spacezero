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
    store.setExplorerScrollTop('session-1', 144)
    store.setSelectedPath('session-1', 'src/one.ts')
    store.setExpanded('session-1', 'src', true)
    store.setExplorerSearch('session-1', 'contents', 'revision conflict')

    store.setExplorerWidth('session-2', 360)
    store.setSelectedPath('session-2', 'README.md')

    expect(useFilesStore.getState().contexts).toMatchObject({
      'session-1': {
        explorerWidth: 280,
        explorerCollapsed: true,
        explorerScrollTop: 144,
        selectedPath: 'src/one.ts',
        expandedPaths: ['src'],
        explorerSearchMode: 'contents',
        filesSearchQuery: '',
        contentSearchQuery: 'revision conflict'
      },
      'session-2': {
        explorerWidth: 360,
        explorerCollapsed: false,
        explorerScrollTop: 0,
        selectedPath: 'README.md',
        expandedPaths: [],
        explorerSearchMode: 'files',
        filesSearchQuery: '',
        contentSearchQuery: ''
      }
    })
  })

  it('opens every Markdown and MDX tab in source mode', () => {
    const store = useFilesStore.getState()

    expect(store.beginOpenTab('session-1', 'README.md', 'preview', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('README.md', '# Safe'), 1)
    expect(store.beginOpenTab('session-1', 'docs/page.mdx', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('docs/page.mdx', '# Page'), 2)
    expect(store.beginOpenTab('session-1', 'docs/lossy.mdx', 'permanent', 3)).toBe(true)
    store.finishOpenTab(
      'session-1',
      textDocument('docs/lossy.mdx', `import X from './x'\n\n# Page`),
      3
    )

    expect(useFilesStore.getState().contexts['session-1'].tabs).toMatchObject([
      { relativePath: 'README.md', editorMode: 'source' },
      { relativePath: 'docs/page.mdx', editorMode: 'source' },
      { relativePath: 'docs/lossy.mdx', editorMode: 'source' }
    ])
  })

  it('keeps rich mode session-only and isolated between Project Session tabs', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'README.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('README.md', '# One'), 1)
    expect(store.beginOpenTab('session-2', 'README.md', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-2', textDocument('README.md', '# Two'), 2)

    store.setEditorMode('session-1', 'README.md', 'rich')

    expect(useFilesStore.getState().contexts['session-1'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      editorMode: 'rich'
    })
    expect(useFilesStore.getState().contexts['session-2'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      editorMode: 'source'
    })
  })

  it('restores a permanent Markdown tab in Source after Rich was selected during the prior run', async () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-restore-mode', 'README.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-restore-mode', textDocument('README.md', '# Saved'), 1)
    store.setEditorMode('session-restore-mode', 'README.md', 'rich')

    const persisted = window.localStorage.getItem('spacezero.files')
    expect(persisted).not.toContain('rich')
    useFilesStore.setState({ contexts: {} })
    window.localStorage.setItem('spacezero.files', persisted!)
    await useFilesStore.persist.rehydrate()

    const restored = useFilesStore.getState().contexts['session-restore-mode'].tabs[0]
    expect(restored).toMatchObject({ relativePath: 'README.md', status: 'loading' })
    useFilesStore
      .getState()
      .finishOpenTab(
        'session-restore-mode',
        textDocument('README.md', '# Saved'),
        restored.openRequestId!
      )
    expect(useFilesStore.getState().contexts['session-restore-mode'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      editorMode: 'source'
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
    expect(
      useFilesStore.getState().contexts['session-1'].tabs.map((tab) => tab.relativePath)
    ).toEqual(['two.txt', 'one.txt', 'three.txt'])

    store.reorderTabs('session-1', 'three.txt', 'two.txt', 'before')
    expect(
      useFilesStore.getState().contexts['session-1'].tabs.map((tab) => tab.relativePath)
    ).toEqual(['three.txt', 'two.txt', 'one.txt'])

    store.reorderTabs('session-1', 'three.txt', 'one.txt', 'after')
    expect(
      useFilesStore.getState().contexts['session-1'].tabs.map((tab) => tab.relativePath)
    ).toEqual(['two.txt', 'one.txt', 'three.txt'])
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

  it('revalidates existing clean, error, and pending tabs while preserving dirty buffers', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-revalidate', 'clean.txt', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-revalidate', textDocument('clean.txt', 'saved'), 1)
    expect(store.beginOpenTab('session-revalidate', 'dirty.txt', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-revalidate', textDocument('dirty.txt', 'saved'), 2)
    store.updateDraft('session-revalidate', 'dirty draft')
    expect(store.beginOpenTab('session-revalidate', 'failed.txt', 'permanent', 3)).toBe(true)
    store.failOpenTab('session-revalidate', 'failed.txt', 'not found', 3)
    expect(store.beginOpenTab('session-revalidate', 'pending.txt', 'permanent', 4)).toBe(true)

    expect(
      store.beginOpenTab('session-revalidate', 'clean.txt', 'preview', 5, undefined, true)
    ).toBe(true)
    expect(
      store.beginOpenTab('session-revalidate', 'dirty.txt', 'preview', 6, undefined, true)
    ).toBe(false)
    expect(
      store.beginOpenTab('session-revalidate', 'failed.txt', 'preview', 7, undefined, true)
    ).toBe(true)
    expect(
      store.beginOpenTab('session-revalidate', 'pending.txt', 'preview', 8, undefined, true)
    ).toBe(true)
    store.failOpenTab('session-revalidate', 'pending.txt', 'stale failure', 4)
    store.failOpenTab('session-revalidate', 'pending.txt', 'current failure', 8)

    expect(useFilesStore.getState().contexts['session-revalidate']).toMatchObject({
      tabs: [
        { relativePath: 'clean.txt', status: 'loading', openRequestId: 5 },
        { relativePath: 'dirty.txt', status: 'ready', draft: 'dirty draft', dirty: true },
        { relativePath: 'failed.txt', status: 'loading', openRequestId: 7 },
        { relativePath: 'pending.txt', status: 'error', message: 'current failure' }
      ]
    })
  })

  it('clears a consumed location target without touching the editor buffer', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-line-target', 'README.md', 'permanent', 1, 4)).toBe(true)
    store.finishOpenTab('session-line-target', textDocument('README.md', '# Title'), 1)
    store.updateDraft('session-line-target', '# Dirty')

    store.clearLocationTarget('session-line-target', 'README.md', 1)

    expect(useFilesStore.getState().contexts['session-line-target'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      targetLine: undefined,
      locationRequestId: undefined,
      draft: '# Dirty',
      dirty: true,
      editorMode: 'source'
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

  it('rewrites affected tab, selection, and expanded paths after rename or move', () => {
    const store = useFilesStore.getState()
    store.setSelectedPath('session-1', 'src/old/index.ts')
    store.setExpanded('session-1', 'src/old', true)
    expect(store.beginOpenTab('session-1', 'src/old/index.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/old/index.ts', 'saved'), 1)
    store.updateDraft('session-1', 'draft')

    store.rewritePaths('session-1', 'src/old', 'src/new')

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      selectedPath: 'src/new/index.ts',
      expandedPaths: ['src/new'],
      activeTabPath: 'src/new/index.ts',
      tabs: [
        {
          relativePath: 'src/new/index.ts',
          name: 'index.ts',
          draft: 'draft',
          dirty: true
        }
      ]
    })
  })

  it('falls back to the parent selection when Trash removes a selected item without open tabs', () => {
    const store = useFilesStore.getState()
    store.setSelectedPath('session-1', 'notes/archive/old.md')
    expect(store.beginOpenTab('session-1', 'other.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('other.md', 'other saved'), 1)

    store.closeTabsInPath('session-1', 'notes/archive/old.md')

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'other.md',
      selectedPath: 'other.md',
      tabs: [{ relativePath: 'other.md' }]
    })
  })

  it('discards dirty affected tabs before mutation and closes affected tabs after Trash succeeds', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'notes/a.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('notes/a.md', 'saved'), 1)
    store.updateDraft('session-1', 'draft')
    expect(store.beginOpenTab('session-1', 'other.md', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('other.md', 'other saved'), 2)

    store.discardDirtyTabsInPath('session-1', 'notes')
    store.closeTabsInPath('session-1', 'notes')

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      activeTabPath: 'other.md',
      tabs: [{ relativePath: 'other.md' }]
    })
  })

  it('reloads a clean external document while preserving tab identity and valid editor mode', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-external-clean', 'README.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-external-clean', textDocument('README.md', '# old'), 1)
    store.setEditorMode('session-external-clean', 'README.md', 'source')
    store.reloadCleanExternalDocument('session-external-clean', {
      ...textDocument('README.md', '# new'),
      revision: 'new-revision'
    })

    expect(useFilesStore.getState().contexts['session-external-clean'].tabs[0]).toMatchObject({
      relativePath: 'README.md',
      content: '# new',
      draft: '# new',
      dirty: false,
      revision: 'new-revision',
      editorMode: 'source',
      editorStateKey: 'README.md:revision:new-revision'
    })
  })

  it('preserves dirty buffers and blocks normal save after external modification', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-external-conflict', 'src/index.ts', 'permanent', 1)).toBe(
      true
    )
    store.finishOpenTab('session-external-conflict', textDocument('src/index.ts', 'saved'), 1)
    store.updateDraft('session-external-conflict', 'local draft')

    store.markExternalConflict('session-external-conflict', 'src/index.ts', 'disk-revision')
    store.markSaving('session-external-conflict', {
      relativePath: 'src/index.ts',
      content: 'local draft',
      expectedRevision: 'src/index.ts-revision'
    })

    expect(useFilesStore.getState().contexts['session-external-conflict'].tabs[0]).toMatchObject({
      draft: 'local draft',
      dirty: true,
      saveStatus: 'error',
      externalStatus: { kind: 'conflict', diskRevision: 'disk-revision' }
    })
  })

  it('keeps deleted-on-disk buffers open until recreated or closed', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-external-delete', 'note.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-external-delete', textDocument('note.md', 'saved'), 1)

    store.markDeletedOnDisk('session-external-delete', 'note.md')

    expect(useFilesStore.getState().contexts['session-external-delete'].tabs[0]).toMatchObject({
      relativePath: 'note.md',
      draft: 'saved',
      dirty: true,
      externalStatus: { kind: 'deleted', missingRevision: 'note.md-revision' }
    })
  })

  it('keeps restored missing paths actionable without blocking other restored tabs', async () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-restore', 'missing.md', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-restore', textDocument('missing.md'), 1)
    expect(store.beginOpenTab('session-restore', 'ok.md', 'permanent', 2)).toBe(true)
    store.finishOpenTab('session-restore', textDocument('ok.md'), 2)
    const persisted = window.localStorage.getItem('spacezero.files')

    useFilesStore.setState({ contexts: {} })
    window.localStorage.setItem('spacezero.files', persisted!)
    await useFilesStore.persist.rehydrate()
    const [missing, ok] = useFilesStore.getState().contexts['session-restore'].tabs

    useFilesStore
      .getState()
      .failOpenTab(
        'session-restore',
        'missing.md',
        'This restored file no longer exists.',
        missing.openRequestId!
      )
    useFilesStore
      .getState()
      .finishOpenTab('session-restore', textDocument('ok.md'), ok.openRequestId!)

    expect(useFilesStore.getState().contexts['session-restore'].tabs).toMatchObject([
      {
        relativePath: 'missing.md',
        status: 'error',
        message: 'This restored file no longer exists.'
      },
      { relativePath: 'ok.md', status: 'ready', draft: 'ok.md saved', dirty: false }
    ])
  })

  it('clears one deleted Files context without affecting another context', () => {
    const store = useFilesStore.getState()
    expect(store.beginOpenTab('session-1', 'one.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('one.ts'), 1)
    expect(store.beginOpenTab('knowledge-base', 'notes.md', 'permanent', 2)).toBe(true)
    store.finishOpenTab('knowledge-base', textDocument('notes.md'), 2)

    store.clearContext('session-1')

    expect(useFilesStore.getState().contexts['session-1']).toBeUndefined()
    expect(useFilesStore.getState().contexts['knowledge-base']).toMatchObject({
      tabs: [{ relativePath: 'notes.md' }]
    })
  })

  it('restores permanent working-set references without persisted file contents or preview tabs', async () => {
    const store = useFilesStore.getState()
    store.setExplorerWidth('session-1', 320)
    store.setExplorerCollapsed('session-1', true)
    store.setExpanded('session-1', 'src', true)
    expect(store.beginOpenTab('session-1', 'src/index.ts', 'permanent', 1)).toBe(true)
    store.finishOpenTab('session-1', textDocument('src/index.ts'), 1)
    store.setEditorMode('session-1', 'src/index.ts', 'source')
    store.setSourceViewState('session-1', 'src/index.ts', {
      cursorState: [{ position: { lineNumber: 2, column: 3 } }]
    })
    expect(store.beginOpenTab('session-1', 'preview.txt', 'preview', 2)).toBe(true)
    store.finishOpenTab('session-1', textDocument('preview.txt', 'preview content'), 2)
    store.activateTab('session-1', 'src/index.ts')
    store.updateDraft('session-1', 'unsaved draft')
    const persisted = window.localStorage.getItem('spacezero.files')
    expect(persisted).toContain('"explorerWidth":320')
    expect(persisted).toContain('src/index.ts')
    expect(persisted).not.toContain('preview.txt')
    expect(persisted).not.toContain('src/index.ts saved')
    expect(persisted).not.toContain('unsaved draft')

    useFilesStore.setState({ contexts: {} })
    window.localStorage.setItem('spacezero.files', persisted!)
    await useFilesStore.persist.rehydrate()

    expect(useFilesStore.getState().contexts['session-1']).toMatchObject({
      explorerWidth: 320,
      explorerCollapsed: true,
      expandedPaths: ['src'],
      activeTabPath: 'src/index.ts',
      tabs: [
        {
          relativePath: 'src/index.ts',
          status: 'loading',
          preview: false
        }
      ],
      editorViewStates: {
        'src/index.ts': {
          sourceViewState: { cursorState: [{ position: { lineNumber: 2, column: 3 } }] }
        }
      }
    })
  })
})
