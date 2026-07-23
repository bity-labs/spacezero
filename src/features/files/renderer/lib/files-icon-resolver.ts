import manifest from 'material-icon-theme/dist/material-icons.json'

import type { FilesEntryKind } from '../../shared'

export function resolveFilesIconName({
  name,
  kind,
  expanded
}: {
  name: string
  kind: FilesEntryKind
  expanded: boolean
}): string {
  const normalizedName = name.toLowerCase()

  if (kind === 'directory') {
    const association = expanded
      ? manifest.folderNamesExpanded?.[normalizedName]
      : manifest.folderNames?.[normalizedName]
    return association ?? (expanded ? manifest.folderExpanded : manifest.folder) ?? 'folder'
  }

  const filenameAssociation = manifest.fileNames?.[normalizedName]
  if (filenameAssociation) return filenameAssociation

  for (const extension of extensionCandidates(normalizedName)) {
    const extensionAssociation = manifest.fileExtensions?.[extension]
    if (extensionAssociation) return extensionAssociation
  }

  return manifest.file ?? 'file'
}

function extensionCandidates(name: string): string[] {
  const candidates: string[] = []
  for (let index = name.indexOf('.'); index >= 0; index = name.indexOf('.', index + 1)) {
    if (index < name.length - 1) candidates.push(name.slice(index + 1))
  }
  return candidates
}
