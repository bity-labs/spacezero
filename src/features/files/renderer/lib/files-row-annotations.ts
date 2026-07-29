import type { FileTreeRowDecoration } from '@pierre/trees'

import type { FilesEntry, FilesEntryPolicyAnnotation } from '../../shared'
import type { FilesTabState } from '../files-store'

type FilesRowAnnotation = {
  text: string
  title: string
}

export function getFilesRowDecoration(
  entry: FilesEntry,
  tabs: readonly FilesTabState[] = []
): FileTreeRowDecoration | null {
  const annotations = [
    ...defaultPolicyAnnotationsForEntry(entry).map(policyAnnotationForEntry).filter(isPresent),
    ...(entry.policyAnnotations?.map(policyAnnotationForEntry).filter(isPresent) ?? []),
    ...openTabAnnotationsForEntry(entry, tabs)
  ]
  const uniqueAnnotations = deduplicateAnnotations(annotations)
  if (uniqueAnnotations.length === 0) return null

  return {
    text: uniqueAnnotations.map((annotation) => annotation.text).join(' · '),
    title: uniqueAnnotations.map((annotation) => annotation.title).join(' ')
  }
}

function defaultPolicyAnnotationsForEntry(entry: FilesEntry): FilesEntryPolicyAnnotation[] {
  if (entry.kind !== 'symlink') return []
  return [{ kind: 'symlink' }, { kind: 'locked', reason: 'filesystem-policy' }]
}

function policyAnnotationForEntry(annotation: FilesEntryPolicyAnnotation): FilesRowAnnotation | null {
  if (annotation.kind === 'symlink') {
    return {
      text: 'Symbolic link',
      title:
        'Symbolic links are identifiable but cannot be opened, edited through, searched through, renamed, moved, or trashed from Files.'
    }
  }
  if (annotation.kind === 'protected') {
    return {
      text: 'Protected',
      title:
        annotation.reason === 'git-internals'
          ? '.git internals are protected by Files policy; every action still validates in the main process.'
          : 'This item is protected by Files policy; every action still validates in the main process.'
    }
  }
  return {
    text: 'Locked',
    title:
      'This item is locked by Files policy; every action still validates in the main process.'
  }
}

function openTabAnnotationsForEntry(
  entry: FilesEntry,
  tabs: readonly FilesTabState[]
): FilesRowAnnotation[] {
  const exactConflict = tabs.find(
    (tab) =>
      tab.status === 'ready' && tab.relativePath === entry.relativePath && tab.externalStatus
  )
  if (exactConflict?.status === 'ready' && exactConflict.externalStatus) {
    return [openTabAnnotation(exactConflict.externalStatus.kind, 'exact')]
  }

  if (entry.kind !== 'directory') return []
  const descendantConflict = tabs.find(
    (tab) =>
      tab.status === 'ready' &&
      tab.relativePath.startsWith(`${entry.relativePath}/`) &&
      tab.externalStatus
  )
  if (descendantConflict?.status === 'ready' && descendantConflict.externalStatus) {
    return [openTabAnnotation(descendantConflict.externalStatus.kind, 'descendant')]
  }

  return []
}

function openTabAnnotation(
  statusKind: 'conflict' | 'deleted',
  scope: 'exact' | 'descendant'
): FilesRowAnnotation {
  if (scope === 'descendant') {
    return {
      text: statusKind === 'deleted' ? 'Deleted tab inside' : 'Open conflict inside',
      title:
        statusKind === 'deleted'
          ? 'An open tab in this folder was deleted on disk; resolve it before renaming, moving, or trashing this folder.'
          : 'An open tab in this folder has an unresolved disk conflict; resolve it before renaming, moving, or trashing this folder.'
    }
  }

  return {
    text: statusKind === 'deleted' ? 'Deleted on disk' : 'Open conflict',
    title:
      statusKind === 'deleted'
        ? 'This file has an open tab that was deleted on disk; recreate or close the tab before continuing.'
        : 'This file has an open tab with an unresolved disk conflict; reload or overwrite from the tab before saving.'
  }
}

function deduplicateAnnotations(annotations: FilesRowAnnotation[]): FilesRowAnnotation[] {
  const seen = new Set<string>()
  return annotations.filter((annotation) => {
    if (seen.has(annotation.text)) return false
    seen.add(annotation.text)
    return true
  })
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
