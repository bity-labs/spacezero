import { useSidePaneStore, type SidePaneTab } from '../../side-pane/renderer'
import type { FilesContext } from '../shared'
import { useFilesStore, type FilesSaveRequestSnapshot, type FilesTabState } from './files-store'

const saveConflictMessage =
  'This file changed on disk. Reload from disk or review the external changes before saving.'

export function filesSidePaneTabId(relativePath: string): string {
  return `files:${encodeURIComponent(relativePath)}`
}

export function activateFilesSidePaneTab(filesContextKey: string, tab: SidePaneTab): void {
  if (tab.resourceId) useFilesStore.getState().activateTab(filesContextKey, tab.resourceId)
}

export function promoteFilesSidePaneTab(filesContextKey: string, tab: SidePaneTab): void {
  if (tab.resourceId) useFilesStore.getState().promoteTab(filesContextKey, tab.resourceId)
}

export async function requestCloseFilesSidePaneTab({
  filesContextKey,
  ipcContext,
  tab
}: {
  filesContextKey: string
  ipcContext: FilesContext
  tab: SidePaneTab
}): Promise<boolean> {
  if (!tab.resourceId) return true
  const files = useFilesStore.getState()
  const document = files.contexts[filesContextKey]?.tabs.find(
    (candidate) => candidate.relativePath === tab.resourceId
  )
  if (!document) return true
  if (document.status !== 'ready' || !document.dirty) {
    files.closeTab(filesContextKey, document.relativePath)
    return true
  }

  const choice = window
    .prompt(
      `Save, discard, or cancel changes to ${document.name}? Type save, discard, or cancel.`,
      'cancel'
    )
    ?.trim()
    .toLowerCase()
  if (choice === 'discard') {
    useFilesStore.getState().discardAndCloseTab(filesContextKey, document.relativePath)
    return true
  }
  if (choice !== 'save') return false

  const request: FilesSaveRequestSnapshot = {
    relativePath: document.relativePath,
    content: document.draft,
    expectedRevision: document.revision
  }
  useFilesStore.getState().markSaving(filesContextKey, request)
  try {
    const result = await window.spacezero.files.saveDocument({ context: ipcContext, ...request })
    if (result.status === 'conflict') {
      useFilesStore.getState().markSaveFailed(filesContextKey, saveConflictMessage, request)
      useFilesStore
        .getState()
        .markExternalConflict(filesContextKey, document.relativePath, result.document.revision)
      return false
    }
    useFilesStore.getState().markSaved(filesContextKey, result.document, request)
    useFilesStore.getState().closeTab(filesContextKey, document.relativePath)
    return !useFilesStore
      .getState()
      .contexts[filesContextKey]?.tabs.some(
        (candidate) => candidate.relativePath === document.relativePath
      )
  } catch {
    useFilesStore
      .getState()
      .markSaveFailed(
        filesContextKey,
        'Couldn’t save this file. Your changes are still in memory.',
        request
      )
    return false
  }
}

export function synchronizeFilesSidePaneTabs(
  filesContextKey: string,
  sidePaneContextKey: string,
  activate: boolean
): void {
  const filesContext = useFilesStore.getState().contexts[filesContextKey]
  if (!filesContext) return
  const sidePaneContext = useSidePaneStore.getState().contexts[sidePaneContextKey]
  const existingFilesTabs = sidePaneContext?.tabs.filter((tab) => tab.categoryId === 'files') ?? []
  if (
    filesContext.tabs.length === 0 &&
    existingFilesTabs.length > 0 &&
    existingFilesTabs.every((tab) => tab.resourceId === undefined)
  ) {
    return
  }

  const tabs = filesContext.tabs.map(toFilesSidePaneTab)
  const activeTabId = filesContext.activeTabPath
    ? filesSidePaneTabId(filesContext.activeTabPath)
    : null
  useSidePaneStore
    .getState()
    .synchronizeCategoryTabs(sidePaneContextKey, 'files', tabs, activeTabId, activate)
}

function toFilesSidePaneTab(tab: FilesTabState): SidePaneTab {
  return {
    id: filesSidePaneTabId(tab.relativePath),
    categoryId: 'files',
    resourceId: tab.relativePath,
    label: tab.name,
    preview: tab.preview,
    dirty: tab.status === 'ready' && tab.dirty
  }
}
