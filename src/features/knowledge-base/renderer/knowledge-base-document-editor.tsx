import { useState } from 'react'

import { Button } from '@renderer/components/ui/button'
import type { KnowledgeBaseDocument } from '../shared'
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
  const [mode, setMode] = useState<'rich' | 'source'>(
    supportsRichMode ? 'rich' : 'source'
  )

  return (
    <KnowledgeBaseSourceEditor
      document={document}
      onDocumentChange={onDocumentChange}
      headerActions={
        supportsRichMode ? (
          <div className="flex items-center rounded-md border p-0.5" aria-label="Editor mode">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={mode === 'rich'}
              onClick={() => setMode('rich')}
            >
              Rich
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={mode === 'source'}
              onClick={() => setMode('source')}
            >
              Source
            </Button>
          </div>
        ) : undefined
      }
      renderEditor={
        mode === 'rich'
          ? ({ value, onChange }) => (
              <KnowledgeBaseRichEditor markdown={value} onChange={onChange} />
            )
          : undefined
      }
    />
  )
}
