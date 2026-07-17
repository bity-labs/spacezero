import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import type { KnowledgeBaseDocument } from '../shared'
import { getRichMarkdownLimitation } from './knowledge-base-markdown'
import { KnowledgeBaseRichEditor } from './knowledge-base-rich-editor'
import { KnowledgeBaseSourceEditor } from './knowledge-base-source-editor'

export function KnowledgeBaseDocumentEditor({
  document,
  onDocumentChange
}: {
  document: KnowledgeBaseDocument
  onDocumentChange?: (document: KnowledgeBaseDocument) => void
}): React.JSX.Element {
  const supportsRichMode = document.contentKind === 'markdown'
  const markdownOptions = { isMdx: document.name.toLowerCase().endsWith('.mdx') }
  const richModeLimitation = supportsRichMode
    ? getRichMarkdownLimitation(document.content ?? '', markdownOptions)
    : null
  const [mode, setMode] = useState<'rich' | 'source'>(
    supportsRichMode && !richModeLimitation ? 'rich' : 'source'
  )

  return (
    <KnowledgeBaseSourceEditor
      document={document}
      onDocumentChange={onDocumentChange}
      renderHeaderActions={
        supportsRichMode
          ? (value) => {
              const limitation = getRichMarkdownLimitation(value, markdownOptions)

              return (
                <div className="flex items-center rounded-md border p-0.5" aria-label="Editor mode">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-pressed={mode === 'rich'}
                    className={mode === 'rich' ? 'bg-muted text-foreground' : undefined}
                    disabled={Boolean(limitation)}
                    onClick={() => setMode('rich')}
                  >
                    Rich
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-pressed={mode === 'source'}
                    className={mode === 'source' ? 'bg-muted text-foreground' : undefined}
                    onClick={() => setMode('source')}
                  >
                    Source
                  </Button>
                </div>
              )
            }
          : undefined
      }
      renderEditorNotice={
        supportsRichMode
          ? (value) => {
              const limitation = getRichMarkdownLimitation(value, markdownOptions)

              return limitation ? (
                <Alert className="mb-3">
                  <AlertDescription>{limitation}</AlertDescription>
                </Alert>
              ) : null
            }
          : undefined
      }
      renderEditor={
        mode === 'rich'
          ? ({ value, onChange }) => {
              const limitation = getRichMarkdownLimitation(value, markdownOptions)

              return limitation ? (
                <RichModeGuard limitation={limitation} onUseSource={() => setMode('source')} />
              ) : (
                <KnowledgeBaseRichEditor
                  documentRelativePath={document.relativePath}
                  markdown={value}
                  onChange={onChange}
                />
              )
            }
          : undefined
      }
    />
  )
}

function RichModeGuard({
  limitation,
  onUseSource
}: {
  limitation: string
  onUseSource: () => void
}): React.JSX.Element {
  useEffect(onUseSource, [onUseSource])

  return (
    <Alert className="mb-3">
      <AlertDescription>{limitation}</AlertDescription>
    </Alert>
  )
}
