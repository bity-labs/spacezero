import type { ComponentProps } from 'react'

import { RichMarkdownEditor } from './rich-markdown-editor'

export const richMarkdownEditorFixture = {
  documentRelativePath: 'README.md',
  markdown: `---
title: Files in Space Zero
status: draft
---

# Files in Space Zero

The **Files** tool keeps a shared explorer beside the active document.

## Editing workflow

- Open a file once for a replaceable preview.
- Edit or pin it to make the tab permanent.
- Resolve external changes before saving a conflict.

> Markdown and MDX begin in Source mode, with Rich mode available for supported documents.

| Surface | Responsibility |
| --- | --- |
| Explorer | Navigation and search |
| Editor | Source and rich editing |
`,
  onChange: () => undefined
} satisfies ComponentProps<typeof RichMarkdownEditor>
