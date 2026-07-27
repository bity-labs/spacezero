import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY, type FilesContext } from '../shared'
import { useFilesStore, type FilesSaveRequestSnapshot, type FilesTabState } from './files-store'

type DirtyFilesTab = Extract<FilesTabState, { status: 'ready' }>

type DirtyFilesContext = {
  contextKey: string
  ipcContext: FilesContext
  tabs: DirtyFilesTab[]
}

const FILES_EXIT_PROMPT =
  'Unsaved Files changes exist. Type save to Save All, discard to Discard All, or cancel to keep Space Zero open.'

export async function confirmFilesExit(): Promise<boolean> {
  const dirtyContexts = getDirtyFilesContexts()
  if (dirtyContexts.length === 0) return true

  const choice = window.prompt(FILES_EXIT_PROMPT, 'cancel')?.trim().toLowerCase()
  if (choice === 'discard') {
    for (const context of dirtyContexts) {
      useFilesStore.getState().discardAllDirtyTabs(context.contextKey)
    }
    return true
  }
  if (choice !== 'save') return false

  const failedPaths = await saveAllDirtyFiles(dirtyContexts)
  if (failedPaths.length > 0) {
    window.alert(
      `Space Zero could not quit because these Files tabs are still dirty:\n${failedPaths.join('\n')}`
    )
    return false
  }
  return true
}

export function registerFilesExitGuard(): () => void {
  const previous = window.spacezeroConfirmFilesExit
  window.spacezeroConfirmFilesExit = confirmFilesExit
  return () => {
    if (window.spacezeroConfirmFilesExit === confirmFilesExit) {
      window.spacezeroConfirmFilesExit = previous
    }
  }
}

function getDirtyFilesContexts(): DirtyFilesContext[] {
  return Object.entries(useFilesStore.getState().contexts)
    .map(([contextKey, context]) => ({
      contextKey,
      ipcContext: toIpcContext(contextKey),
      tabs: context.tabs.filter(
        (tab): tab is DirtyFilesTab =>
          tab.status === 'ready' && tab.dirty && tab.saveStatus !== 'saving'
      )
    }))
    .filter((context) => context.tabs.length > 0)
}

async function saveAllDirtyFiles(contexts: DirtyFilesContext[]): Promise<string[]> {
  await Promise.all(
    contexts.flatMap((context) =>
      context.tabs.map(async (tab) => {
        if (tab.externalStatus) return
        const request: FilesSaveRequestSnapshot = {
          relativePath: tab.relativePath,
          content: tab.draft,
          expectedRevision: tab.revision
        }
        useFilesStore.getState().markSaving(context.contextKey, request)
        try {
          const result = await window.spacezero.files.saveDocument({
            context: context.ipcContext,
            ...request
          })
          if (result.status === 'conflict') {
            useFilesStore
              .getState()
              .markSaveFailed(context.contextKey, 'This file changed on disk.', request)
            useFilesStore
              .getState()
              .markExternalConflict(context.contextKey, tab.relativePath, result.document.revision)
            return
          }
          useFilesStore.getState().markSaved(context.contextKey, result.document, request)
        } catch (error) {
          useFilesStore
            .getState()
            .markSaveFailed(context.contextKey, saveErrorMessage(error), request)
        }
      })
    )
  )

  return getDirtyFilesContexts().flatMap((context) =>
    context.tabs.map((tab) => `${context.contextKey}: ${tab.relativePath}`)
  )
}

function toIpcContext(contextKey: string): FilesContext {
  return contextKey === KNOWLEDGE_BASE_FILES_CONTEXT_KEY
    ? { kind: 'knowledge-base', contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY }
    : { kind: 'project-session', sessionId: contextKey }
}

function saveErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('files.contentTooLarge')) return 'This file is too large to save from Files.'
  if (code.includes('files.notEditableText')) return 'This file is not editable text.'
  return 'Couldn’t save this file. Your changes are still in memory.'
}

declare global {
  interface Window {
    spacezeroConfirmFilesExit?: () => boolean | Promise<boolean>
  }
}
