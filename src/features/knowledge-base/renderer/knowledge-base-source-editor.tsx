import { useEffect, useState, type ReactNode } from 'react'

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

export function KnowledgeBaseSourceEditor({
  document,
  onDocumentChange,
  headerActions,
  renderEditor
}: {
  document: KnowledgeBaseDocument
  onDocumentChange?: (document: KnowledgeBaseDocument) => void
  headerActions?: ReactNode
  renderEditor?: (props: KnowledgeBaseEditorRenderProps) => ReactNode
}): React.JSX.Element {
  const [draft, setDraft] = useState(document.content ?? '')
  const [savedContent, setSavedContent] = useState(document.content ?? '')
  const [revision, setRevision] = useState(document.revision)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [externalDocument, setExternalDocument] = useState<KnowledgeBaseDocument | null>(null)

  useEffect(() => {
    if (draft === savedContent || externalDocument) return undefined

    const timeout = window.setTimeout(() => {
      setSaveState('saving')
      void window.spacezero.knowledgeBase
        .saveDocument({
          relativePath: document.relativePath,
          content: draft,
          expectedRevision: revision
        })
        .then((result) => {
          if (result.status === 'conflict') {
            setExternalDocument(result.document)
            setSaveState('external')
            return
          }

          setRevision(result.document.revision)
          setSavedContent(result.document.content ?? draft)
          setSaveState('saved')
          onDocumentChange?.(result.document)
        })
        .catch(() => setSaveState('error'))
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [document.relativePath, draft, externalDocument, onDocumentChange, revision, savedContent])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void window.spacezero.knowledgeBase
        .checkDocument({ relativePath: document.relativePath, revision })
        .then((result) => {
          if (!result.changed) return
          if (draft !== savedContent || saveState === 'saving') {
            setExternalDocument(result.document)
            setSaveState('external')
            return
          }

          setDraft(result.document.content ?? '')
          setSavedContent(result.document.content ?? '')
          setRevision(result.document.revision)
          setSaveState('external')
          onDocumentChange?.(result.document)
        })
        .catch(() => undefined)
    }, EXTERNAL_CHANGE_POLL_MS)

    return () => window.clearInterval(interval)
  }, [document.relativePath, draft, onDocumentChange, revision, saveState, savedContent])

  function reloadExternalDocument(): void {
    if (!externalDocument) return
    setDraft(externalDocument.content ?? '')
    setSavedContent(externalDocument.content ?? '')
    setRevision(externalDocument.revision)
    setExternalDocument(null)
    setSaveState('external')
    onDocumentChange?.(externalDocument)
  }

  function keepUnsavedEdits(): void {
    if (!externalDocument) return
    setRevision(externalDocument.revision)
    setSavedContent(externalDocument.content ?? '')
    setExternalDocument(null)
    setSaveState('saved')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <h2 className="truncate font-medium">{document.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{document.relativePath}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
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

      {renderEditor ? (
        renderEditor({
          value: draft,
          onChange: (value) => {
            setDraft(value)
            if (saveState === 'error' || saveState === 'external') setSaveState('saved')
          }
        })
      ) : (
        <textarea
          className="min-h-0 flex-1 resize-none rounded-md border bg-background p-4 font-mono text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label={`Edit ${document.name}`}
          value={draft}
          spellCheck={document.contentKind === 'markdown'}
          onChange={(event) => {
            setDraft(event.target.value)
            if (saveState === 'error' || saveState === 'external') setSaveState('saved')
          }}
        />
      )}
    </div>
  )
}

function getSaveStateLabel(state: SaveState): string {
  if (state === 'saving') return 'Saving…'
  if (state === 'error') return 'Save error'
  if (state === 'external') return 'Changed externally'
  return 'Saved'
}
