import { useMemo } from 'react'

import {
  RichMarkdownEditor,
  type RichMarkdownImageAdapter
} from '@renderer/components/rich-markdown-editor'
import { MAX_KNOWLEDGE_BASE_IMAGE_BYTES } from '../shared'

export function KnowledgeBaseRichEditor({
  documentRelativePath,
  markdown,
  onChange
}: {
  documentRelativePath: string
  markdown: string
  onChange: (markdown: string) => void
}): React.JSX.Element {
  const imageAdapter = useMemo<RichMarkdownImageAdapter>(
    () => ({
      maxBytes: MAX_KNOWLEDGE_BASE_IMAGE_BYTES,
      importImage: async (image) => {
        const result = await window.spacezero.knowledgeBase.importImage({
          documentRelativePath,
          fileName: image.name,
          bytes: new Uint8Array(await image.arrayBuffer())
        })
        return {
          markdownPath: result.markdownPath,
          altText: result.altText
        }
      },
      loadImage: ({ markdownPath }) =>
        window.spacezero.knowledgeBase.loadImage({ documentRelativePath, markdownPath })
    }),
    [documentRelativePath]
  )

  return (
    <RichMarkdownEditor
      documentRelativePath={documentRelativePath}
      imageAdapter={imageAdapter}
      markdown={markdown}
      onChange={onChange}
    />
  )
}
