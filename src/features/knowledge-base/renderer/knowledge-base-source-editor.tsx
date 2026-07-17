import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode
} from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import type { KnowledgeBaseDocument } from '../shared'

const AUTOSAVE_DELAY_MS = 600
const EXTERNAL_CHANGE_POLL_MS = 2_000

type SaveState = 'saved' | 'saving' | 'error' | 'external'

export type KnowledgeBaseEditorRenderProps = {
  value: string
  onChange: (value: string) => void
}

export type KnowledgeBaseSourceEditorHandle = {
  flushPendingSave: () => Promise<boolean>
  hasPendingSave: () => boolean
}

type KnowledgeBaseSourceEditorProps = {
  document: KnowledgeBaseDocument
  onDocumentChange?: (document: KnowledgeBaseDocument) => void
  renderHeaderActions?: (value: string) => ReactNode
  renderEditorNotice?: (value: string) => ReactNode
  renderEditor?: (props: KnowledgeBaseEditorRenderProps) => ReactNode
}

export const KnowledgeBaseSourceEditor = forwardRef<
  KnowledgeBaseSourceEditorHandle,
  KnowledgeBaseSourceEditorProps
>(function KnowledgeBaseSourceEditor(
  {
    document,
    onDocumentChange,
    renderHeaderActions,
    renderEditorNotice,
    renderEditor
  },
  ref
): React.JSX.Element {
  const initialContent = document.content ?? ''
  const [draft, setDraft] = useState(initialContent)
  const [savedContent, setSavedContent] = useState(initialContent)
  const [, setRevision] = useState(document.revision)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [externalDocument, setExternalDocument] = useState<KnowledgeBaseDocument | null>(null)
  const documentRef = useRef(document)
  const draftRef = useRef(initialContent)
  const savedContentRef = useRef(initialContent)
  const revisionRef = useRef(document.revision)
  const saveStateRef = useRef<SaveState>('saved')
  const externalDocumentRef = useRef<KnowledgeBaseDocument | null>(null)
  const onDocumentChangeRef = useRef(onDocumentChange)
  const activeSaveRef = useRef<Promise<boolean> | null>(null)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  documentRef.current = document
  onDocumentChangeRef.current = onDocumentChange

  const updateSaveState = useCallback((state: SaveState): void => {
    saveStateRef.current = state
    if (mountedRef.current) setSaveState(state)
  }, [])

  const saveCurrentDraft = useCallback(async (): Promise<boolean> => {
    if (externalDocumentRef.current) return false
    if (activeSaveRef.current) return activeSaveRef.current
    if (draftRef.current === savedContentRef.current) return true

    const content = draftRef.current
    const relativePath = documentRef.current.relativePath
    const expectedRevision = revisionRef.current
    updateSaveState('saving')

    const savePromise = window.spacezero.knowledgeBase
      .saveDocument({ relativePath, content, expectedRevision })
      .then((result) => {
        if (result.status === 'conflict') {
          externalDocumentRef.current = result.document
          if (mountedRef.current) setExternalDocument(result.document)
          updateSaveState('external')
          return false
        }

        const persistedContent = result.document.content ?? content
        revisionRef.current = result.document.revision
        savedContentRef.current = persistedContent
        if (mountedRef.current) {
          setRevision(result.document.revision)
          setSavedContent(persistedContent)
        }
        updateSaveState('saved')
        onDocumentChangeRef.current?.(result.document)
        return true
      })
      .catch(() => {
        updateSaveState('error')
        return false
      })
      .finally(() => {
        if (activeSaveRef.current === savePromise) activeSaveRef.current = null
      })

    activeSaveRef.current = savePromise
    return savePromise
  }, [updateSaveState])

  const flushPendingSave = useCallback(async (): Promise<boolean> => {
    while (draftRef.current !== savedContentRef.current) {
      if (externalDocumentRef.current) return false
      const saved = await saveCurrentDraft()
      if (!saved) return false
    }
    return true
  }, [saveCurrentDraft])

  const hasPendingSave = useCallback(
    () =>
      draftRef.current !== savedContentRef.current ||
      activeSaveRef.current !== null ||
      externalDocumentRef.current !== null,
    []
  )

  useImperativeHandle(
    ref,
    () => ({ flushPendingSave, hasPendingSave }),
    [flushPendingSave, hasPendingSave]
  )

  useEffect(() => {
    if (draft === savedContent || externalDocument) return undefined

    const timeout = window.setTimeout(() => {
      autosaveTimeoutRef.current = null
      void flushPendingSave()
    }, AUTOSAVE_DELAY_MS)
    autosaveTimeoutRef.current = timeout

    return () => {
      window.clearTimeout(timeout)
      if (autosaveTimeoutRef.current === timeout) autosaveTimeoutRef.current = null
    }
  }, [draft, externalDocument, flushPendingSave, savedContent])

  useEffect(() => {
    let current = true
    const interval = window.setInterval(() => {
      const currentDocument = documentRef.current
      const currentRevision = revisionRef.current
      void window.spacezero.knowledgeBase
        .checkDocument({
          relativePath: currentDocument.relativePath,
          revision: currentRevision
        })
        .then((result) => {
          if (!current || !result.changed) return
          if (
            draftRef.current !== savedContentRef.current ||
            activeSaveRef.current ||
            saveStateRef.current === 'saving'
          ) {
            externalDocumentRef.current = result.document
            setExternalDocument(result.document)
            updateSaveState('external')
            return
          }

          const nextContent = result.document.content ?? ''
          draftRef.current = nextContent
          savedContentRef.current = nextContent
          revisionRef.current = result.document.revision
          setDraft(nextContent)
          setSavedContent(nextContent)
          setRevision(result.document.revision)
          updateSaveState('external')
          onDocumentChangeRef.current?.(result.document)
        })
        .catch(() => undefined)
    }, EXTERNAL_CHANGE_POLL_MS)

    return () => {
      current = false
      window.clearInterval(interval)
    }
  }, [document.relativePath, updateSaveState])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
      void flushPendingSave()
    }
  }, [flushPendingSave])

  function reloadExternalDocument(): void {
    const currentExternalDocument = externalDocumentRef.current
    if (!currentExternalDocument) return
    const content = currentExternalDocument.content ?? ''
    draftRef.current = content
    savedContentRef.current = content
    revisionRef.current = currentExternalDocument.revision
    externalDocumentRef.current = null
    setDraft(content)
    setSavedContent(content)
    setRevision(currentExternalDocument.revision)
    setExternalDocument(null)
    updateSaveState('external')
    onDocumentChangeRef.current?.(currentExternalDocument)
  }

  function keepUnsavedEdits(): void {
    const currentExternalDocument = externalDocumentRef.current
    if (!currentExternalDocument) return
    revisionRef.current = currentExternalDocument.revision
    savedContentRef.current = currentExternalDocument.content ?? ''
    externalDocumentRef.current = null
    setRevision(currentExternalDocument.revision)
    setSavedContent(currentExternalDocument.content ?? '')
    setExternalDocument(null)
    updateSaveState('saved')
  }

  function updateDraft(value: string): void {
    draftRef.current = value
    setDraft(value)
    if (saveStateRef.current === 'error' || saveStateRef.current === 'external') {
      updateSaveState('saved')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <h2 className="truncate font-medium">{document.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{document.relativePath}</p>
        </div>
        <div className="flex items-center gap-2">
          {renderHeaderActions?.(draft)}
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {getSaveStateLabel(saveState)}
          </span>
        </div>
      </div>

      {externalDocument ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>
            This document changed outside Space Zero. Your unsaved edits were not overwritten.
          </AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={reloadExternalDocument}>
              Reload from disk
            </Button>
            <Button variant="outline" size="sm" onClick={keepUnsavedEdits}>
              Keep my edits
            </Button>
          </div>
        </Alert>
      ) : null}

      {renderEditorNotice?.(draft)}

      {renderEditor ? (
        renderEditor({ value: draft, onChange: updateDraft })
      ) : (
        <textarea
          className="min-h-0 flex-1 resize-none rounded-md border bg-background p-4 font-mono text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label={`Edit ${document.name}`}
          value={draft}
          spellCheck={document.contentKind === 'markdown'}
          onChange={(event) => updateDraft(event.target.value)}
        />
      )}
    </div>
  )
})

function getSaveStateLabel(state: SaveState): string {
  if (state === 'saving') return 'Saving…'
  if (state === 'error') return 'Save error'
  if (state === 'external') return 'Changed externally'
  return 'Saved'
}
