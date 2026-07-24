import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CodeBlockIcon,
  CodeIcon,
  HighlighterIcon,
  ImageSquareIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  MinusIcon,
  QuotesIcon,
  TableIcon,
  TextBIcon,
  TextHIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon
} from '@phosphor-icons/react'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'
import { Separator } from '@renderer/components/ui/separator'
import { splitMarkdownDocument } from '@renderer/lib/rich-markdown'
import './rich-markdown-editor.css'

/** App-native adaptation of Tiptap's MIT-licensed Simple Editor template. */
export type RichMarkdownImageAdapter = {
  maxBytes: number
  importImage?: (image: File) => Promise<{ markdownPath: string; altText: string }>
  loadImage?: (request: { documentRelativePath: string; markdownPath: string }) => Promise<{ dataUrl: string }>
}

export function RichMarkdownEditor({
  documentRelativePath,
  markdown,
  onChange,
  imageAdapter
}: {
  documentRelativePath: string
  markdown: string
  onChange: (markdown: string) => void
  imageAdapter?: RichMarkdownImageAdapter
}): React.JSX.Element {
  const { body, frontmatter } = splitMarkdownDocument(markdown)
  const frontmatterRef = useRef(frontmatter)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [linkEditorOpen, setLinkEditorOpen] = useState(false)
  const [linkHref, setLinkHref] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const imageExtension = useMemo(
    () => createRichMarkdownImageExtension(documentRelativePath, imageAdapter),
    [documentRelativePath, imageAdapter]
  )

  useEffect(() => {
    frontmatterRef.current = frontmatter
    onChangeRef.current = onChange
  }, [frontmatter, onChange])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          enableClickSelection: true
        },
        trailingNode: false
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      imageExtension,
      TableKit,
      Markdown.configure({ markedOptions: { gfm: true } })
    ],
    content: body,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        'aria-label': 'Rich Markdown editor',
        'aria-multiline': 'true',
        role: 'textbox'
      }
    },
    onUpdate: ({ editor: currentEditor }) =>
      onChangeRef.current(`${frontmatterRef.current}${currentEditor.getMarkdown()}`)
  })

  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.getMarkdown() === body) return

    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(body, {
        contentType: 'markdown',
        emitUpdate: false
      })
      .run()
  }, [body, editor])

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      blockquote: currentEditor?.isActive('blockquote') ?? false,
      bold: currentEditor?.isActive('bold') ?? false,
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      code: currentEditor?.isActive('code') ?? false,
      codeBlock: currentEditor?.isActive('codeBlock') ?? false,
      highlight: currentEditor?.isActive('highlight') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      link: currentEditor?.isActive('link') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false,
      strike: currentEditor?.isActive('strike') ?? false,
      taskList: currentEditor?.isActive('taskList') ?? false,
      underline: currentEditor?.isActive('underline') ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
      canUndo: currentEditor?.can().undo() ?? false
    })
  })

  const uploadImage = async (image: File): Promise<void> => {
    if (!editor) return

    setImageError(null)
    if (!imageAdapter?.importImage) return
    if (image.size > imageAdapter.maxBytes) {
      setImageError('Image must be 10 MB or smaller.')
      return
    }

    setImageUploading(true)
    try {
      const result = await imageAdapter.importImage(image)
      if (editor.isDestroyed) return

      editor.chain().focus().setImage({ src: result.markdownPath, alt: result.altText }).run()
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Could not upload image.')
    } finally {
      setImageUploading(false)
    }
  }

  return (
    <div className="rich-markdown-editor">
      {imageAdapter?.importImage ? (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          aria-label="Choose image"
          className="sr-only"
          onChange={(event) => {
            const image = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (image) void uploadImage(image)
          }}
        />
      ) : null}
      <div
        className="rich-markdown-editor__toolbar"
        role="toolbar"
        aria-label="Markdown formatting"
      >
        <ToolbarButton
          label="Undo"
          disabled={!toolbarState?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <ArrowCounterClockwiseIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!toolbarState?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <ArrowClockwiseIcon />
        </ToolbarButton>

        <ToolbarSeparator />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Text style"
                title="Text style"
                disabled={!editor}
              />
            }
          >
            <TextHIcon />
            <CaretDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => editor?.chain().focus().setParagraph().run()}>
              Paragraph
            </DropdownMenuItem>
            {[1, 2, 3, 4].map((level) => (
              <DropdownMenuItem
                key={level}
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .toggleHeading({ level: level as 1 | 2 | 3 | 4 })
                    .run()
                }
              >
                Heading {level}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolbarButton
          label="Bullet list"
          active={toolbarState?.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <ListBulletsIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={toolbarState?.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListNumbersIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Checklist"
          active={toolbarState?.taskList}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          <ListChecksIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Blockquote"
          active={toolbarState?.blockquote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <QuotesIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={toolbarState?.codeBlock}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <CodeBlockIcon />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          label="Bold"
          active={toolbarState?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <TextBIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={toolbarState?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <TextItalicIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={toolbarState?.strike}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <TextStrikethroughIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={toolbarState?.code}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          <CodeIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={toolbarState?.underline}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <TextUnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Highlight"
          active={toolbarState?.highlight}
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
        >
          <HighlighterIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={toolbarState?.link}
          onClick={() => {
            setLinkHref(String(editor?.getAttributes('link').href ?? ''))
            setLinkError(null)
            setLinkEditorOpen((open) => !open)
          }}
        >
          <LinkSimpleIcon />
        </ToolbarButton>

        <ToolbarSeparator />

        {imageAdapter?.importImage ? (
          <ToolbarButton
            label={imageUploading ? 'Uploading image' : 'Upload image'}
            disabled={imageUploading || !editor}
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageSquareIcon />
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          label="Insert table"
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Horizontal rule"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          <MinusIcon />
        </ToolbarButton>
      </div>

      {imageError ? (
        <p className="rich-markdown-editor__error" role="alert">
          {imageError}
        </p>
      ) : null}

      {linkEditorOpen ? (
        <div
          className="rich-markdown-editor__link-panel"
          role="dialog"
          aria-label="Edit link"
        >
          <form
            className="rich-markdown-editor__link-form"
            onSubmit={(event) => {
              if (applyLink(event, linkHref, editor, setLinkError)) {
                setLinkEditorOpen(false)
              }
            }}
          >
            <Input
              autoFocus
              aria-label="Link URL"
              placeholder="https://example.com"
              value={linkHref}
              onChange={(event) => {
                setLinkHref(event.target.value)
                setLinkError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setLinkEditorOpen(false)
              }}
            />
            <Button type="submit" size="sm">
              Apply link
            </Button>
            {toolbarState?.link ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  editor?.chain().focus().extendMarkRange('link').unsetLink().run()
                  setLinkEditorOpen(false)
                }}
              >
                Remove link
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLinkEditorOpen(false)}
            >
              Cancel
            </Button>
          </form>
          {linkError ? (
            <p className="rich-markdown-editor__link-error" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}

      <EditorContent editor={editor} className="rich-markdown-editor__content" />
    </div>
  )
}

function createRichMarkdownImageExtension(
  documentRelativePath: string,
  imageAdapter?: RichMarkdownImageAdapter
) {
  const previewRequests = new Map<string, Promise<string>>()

  const loadPreview = (markdownPath: string): Promise<string> => {
    const existingRequest = previewRequests.get(markdownPath)
    if (existingRequest) return existingRequest

    if (!imageAdapter?.loadImage) return Promise.resolve(markdownPath)

    const request = imageAdapter
      .loadImage({ documentRelativePath, markdownPath })
      .then(({ dataUrl }) => dataUrl)
      .catch((error: unknown) => {
        previewRequests.delete(markdownPath)
        throw error
      })
    previewRequests.set(markdownPath, request)
    return request
  }

  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const image = document.createElement('img')
        image.draggable = false
        let destroyed = false
        let loadSequence = 0
        let loadedMarkdownPath: string | null = null

        const updateImage = (nextNode: typeof node): void => {
          const markdownPath = String(nextNode.attrs.src ?? '')
          const alt = nextNode.attrs.alt
          const title = nextNode.attrs.title
          const pathChanged = markdownPath !== loadedMarkdownPath
          loadedMarkdownPath = markdownPath

          image.alt = typeof alt === 'string' ? alt : ''
          if (typeof title === 'string' && title) image.title = title
          else image.removeAttribute('title')
          image.dataset.markdownPath = markdownPath
          delete image.dataset.loadError

          if (!pathChanged) return
          const currentLoad = ++loadSequence
          if (!markdownPath) {
            image.removeAttribute('src')
            return
          }
          if (!isLocalImagePath(markdownPath)) {
            image.src = markdownPath
            return
          }

          image.removeAttribute('src')
          void loadPreview(markdownPath)
            .then((dataUrl) => {
              if (!destroyed && currentLoad === loadSequence) image.src = dataUrl
            })
            .catch(() => {
              if (!destroyed && currentLoad === loadSequence) {
                image.dataset.loadError = 'true'
              }
            })
        }

        updateImage(node)
        return {
          dom: image,
          update(updatedNode) {
            if (updatedNode.type !== node.type) return false
            updateImage(updatedNode)
            return true
          },
          destroy() {
            destroyed = true
          }
        }
      }
    }
  })
}

function isLocalImagePath(source: string): boolean {
  return Boolean(source) && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)
}

function ToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick
}: {
  active?: boolean
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      className={active ? 'bg-muted text-foreground' : undefined}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function ToolbarSeparator(): React.JSX.Element {
  return <Separator orientation="vertical" className="mx-1 h-5 self-center" />
}

function applyLink(
  event: FormEvent<HTMLFormElement>,
  value: string,
  editor: Editor | null,
  setError: (message: string | null) => void
): boolean {
  event.preventDefault()
  if (!editor) return false

  const href = normalizeLinkHref(value)
  if (href === null) {
    setError('Enter an HTTP, HTTPS, mail, phone, anchor, or relative link.')
    return false
  }

  if (!href) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return true
  }

  editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  return true
}

function normalizeLinkHref(value: string): string | null {
  const href = value.trim()
  if (!href) return ''
  if (
    [...href].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127
    })
  ) {
    return null
  }

  const scheme = href.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  if (!scheme) return href

  return ['http', 'https', 'mailto', 'tel'].includes(scheme) ? href : null
}
