import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY, type FilesContext } from '../shared'
import { useFilesStore, type FilesSaveRequestSnapshot, type FilesTabState } from './files-store'
import { flushFilesEditorViewStates } from './files-editor-view-state-registry'

type DirtyFilesTab = Extract<FilesTabState, { status: 'ready' }>

type DirtyFilesContext = {
  contextKey: string
  ipcContext: FilesContext
  tabs: DirtyFilesTab[]
}

const FILES_EXIT_PROMPT =
  'Unsaved Files changes exist. Type save to Save All, discard to Discard All, or cancel to keep Space Zero open.'

export async function confirmFilesExit(): Promise<boolean> {
  flushFilesEditorViewStates()
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
      tabs: [
        ...context.tabs.filter((tab): tab is DirtyFilesTab => tab.status === 'ready' && tab.dirty),
        ...Object.values(context.detachedDocuments).filter((document) => document.dirty)
      ]
    }))
    .filter((context) => context.tabs.length > 0)
}

async function saveAllDirtyFiles(contexts: DirtyFilesContext[]): Promise<string[]> {
  await Promise.all(
    contexts.flatMap((context) =>
      context.tabs.map(async (tab) => {
        if (tab.externalStatus || tab.saveStatus === 'saving') return
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

  await waitForDirtySavesToSettle(contexts)

  return getDirtyFilesContexts().flatMap((context) =>
    context.tabs.map((tab) => `${context.contextKey}: ${tab.relativePath}`)
  )
}

function waitForDirtySavesToSettle(contexts: DirtyFilesContext[]): Promise<void> {
  if (!hasDirtySavingTabs(contexts)) return Promise.resolve()

  return new Promise((resolve) => {
    const unsubscribe = useFilesStore.subscribe(() => {
      if (hasDirtySavingTabs(contexts)) return
      unsubscribe()
      resolve()
    })
  })
}

function hasDirtySavingTabs(contexts: DirtyFilesContext[]): boolean {
  const contextKeys = new Set(contexts.map((context) => context.contextKey))
  return Object.entries(useFilesStore.getState().contexts).some(
    ([contextKey, context]) =>
      contextKeys.has(contextKey) &&
      [...context.tabs, ...Object.values(context.detachedDocuments)].some(
        (tab) => tab.status === 'ready' && tab.dirty && tab.saveStatus === 'saving'
      )
  )
}

function toIpcContext(contextKey: string): FilesContext {
  if (contextKey === KNOWLEDGE_BASE_FILES_CONTEXT_KEY) {
    return { kind: 'knowledge-base', contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY }
  }
  if (contextKey.startsWith('project:')) {
    return { kind: 'project-home', projectId: contextKey.slice('project:'.length) }
  }
  return { kind: 'project-session', sessionId: contextKey }
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
