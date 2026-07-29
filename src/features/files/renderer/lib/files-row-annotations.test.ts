import { describe, expect, it } from 'vitest'

import type { FilesEntry } from '../../shared'
import type { FilesTabState } from '../files-store'
import { getFilesRowDecoration } from './files-row-annotations'

const baseEntry = {
  name: 'README.md',
  relativePath: 'README.md',
  kind: 'file' as const
} satisfies FilesEntry

function readyTab(
  relativePath: string,
  externalStatus?: Extract<FilesTabState, { status: 'ready' }>['externalStatus']
): Extract<FilesTabState, { status: 'ready' }> {
  return {
    name: relativePath.split('/').at(-1) ?? relativePath,
    relativePath,
    contentKind: 'text',
    size: 0,
    modifiedAt: new Date(0).toISOString(),
    revision: 'revision-1',
    content: 'saved',
    hasBom: false,
    lineEnding: 'lf',
    status: 'ready',
    draft: 'saved',
    dirty: false,
    saveStatus: 'idle',
    editorMode: 'source',
    preview: false,
    editorStateKey: `${relativePath}:editor`,
    ...(externalStatus ? { externalStatus } : {})
  }
}

describe('Files row annotations', () => {
  it('maps symlink and locked policy annotations without replacing main validation', () => {
    expect(
      getFilesRowDecoration({
        ...baseEntry,
        kind: 'symlink',
        policyAnnotations: [
          { kind: 'symlink' },
          { kind: 'locked', reason: 'filesystem-policy' }
        ]
      })
    ).toEqual({
      text: 'Symbolic link · Locked',
      title:
        'Symbolic links are identifiable but cannot be opened, edited through, searched through, renamed, moved, or trashed from Files. This item is locked by Files policy; every action still validates in the main process.'
    })
  })

  it('maps protected rows including git-internals policy when a protected row is supplied', () => {
    expect(
      getFilesRowDecoration({
        ...baseEntry,
        name: '.git',
        relativePath: '.git',
        kind: 'directory',
        policyAnnotations: [{ kind: 'protected', reason: 'git-internals' }]
      })
    ).toEqual({
      text: 'Protected',
      title:
        '.git internals are protected by Files policy; every action still validates in the main process.'
    })
  })

  it('maps exact and descendant open-tab conflicts from renderer tab state', () => {
    expect(
      getFilesRowDecoration(baseEntry, [
        readyTab('README.md', { kind: 'conflict', diskRevision: 'disk-revision' })
      ])
    ).toMatchObject({ text: 'Open conflict' })

    expect(
      getFilesRowDecoration({ name: 'src', relativePath: 'src', kind: 'directory' }, [
        readyTab('src/index.ts', { kind: 'conflict', diskRevision: 'disk-revision' })
      ])
    ).toMatchObject({ text: 'Open conflict inside' })
  })

  it('does not add oversized, binary, generated, or ignored row noise without action-blocking state', () => {
    expect(getFilesRowDecoration(baseEntry, [readyTab('README.md')])).toBeNull()
  })
})
