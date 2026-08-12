import { useMemo } from 'react'
import { parsePatchFiles } from '@pierre/diffs'
import { CodeView, type CodeViewItem } from '@pierre/diffs/react'

import { useOptionalColorMode } from '@renderer/color-mode-provider'
import { cn } from '@renderer/lib/utils'

export type DiffViewerItem = {
  id: string
  path: string
  oldPath?: string
  patch: string
  collapsed?: boolean
  version?: number
  changeMetadata?: {
    status: string
    additions?: number
    deletions?: number
  }
  headerActions?: {
    status: string
    fileNameTitle?: string
    onFileNameClick?: () => void
    onToggle: () => void
  }
}

type DiffViewerFallback = {
  id: string
  path: string
  message: string
}

type DiffViewerProps = {
  items: DiffViewerItem[]
  className?: string
  fallbackMessage?: string
  ariaLabel?: string
}

const DEFAULT_FALLBACK_MESSAGE = 'No text diff is available for this change.'

export function DiffViewer({
  items,
  className,
  fallbackMessage = DEFAULT_FALLBACK_MESSAGE,
  ariaLabel = 'Diff Viewer'
}: DiffViewerProps): React.JSX.Element {
  const colorMode = useOptionalColorMode()
  const resolvedTheme = colorMode?.resolvedTheme ?? getDocumentResolvedTheme()
  const { codeViewItems, fallbackItems, sourceItems } = useMemo(
    () => buildCodeViewItems(items, fallbackMessage),
    [items, fallbackMessage]
  )
  const hasHeaderActions = codeViewItems.some((item) => sourceItems.get(item.id)?.headerActions)
  const codeThemeType = resolvedTheme === 'light' ? 'light' : 'dark'
  const codeTheme =
    resolvedTheme === 'light'
      ? 'pierre-light'
      : resolvedTheme === 'dark-high-contrast'
        ? 'pierre-dark'
        : 'pierre-dark-soft'

  return (
    <div aria-label={ariaLabel} className={cn('overflow-hidden rounded-lg border', className)}>
      {codeViewItems.length > 0 ? (
        <CodeView
          disableWorkerPool
          items={codeViewItems}
          options={{
            theme: codeTheme,
            themeType: codeThemeType,
            diffStyle: 'unified',
            diffIndicators: 'none',
            hunkSeparators: 'line-info-basic',
            overflow: 'scroll',
            stickyHeaders: true
          }}
          renderHeaderPrefix={
            hasHeaderActions
              ? (item) => <DiffViewerHeaderPrefix item={sourceItems.get(item.id)} />
              : undefined
          }
          renderHeaderMetadata={(item) => (
            <DiffViewerHeaderMetadata item={item} sourceItem={sourceItems.get(item.id)} />
          )}
        />
      ) : null}
      {fallbackItems.map((item) => (
        <div key={item.id} className="border-t p-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{item.path}</span>: {item.message}
        </div>
      ))}
    </div>
  )
}

function buildCodeViewItems(
  items: DiffViewerItem[],
  fallbackMessage: string
): {
  codeViewItems: CodeViewItem[]
  fallbackItems: DiffViewerFallback[]
  sourceItems: Map<string, DiffViewerItem>
} {
  const codeViewItems: CodeViewItem[] = []
  const fallbackItems: DiffViewerFallback[] = []
  const sourceItems = new Map<string, DiffViewerItem>()

  for (const item of items) {
    try {
      const normalizedPatch = normalizeRenderablePatch(item)
      const parsedFiles = parsePatchFiles(normalizedPatch, item.id, false).flatMap(
        (patch) => patch.files
      )
      if (parsedFiles.length === 0) {
        fallbackItems.push({ id: item.id, path: item.path, message: fallbackMessage })
        continue
      }

      parsedFiles.forEach((fileDiff, index) => {
        const id = parsedFiles.length === 1 ? item.id : `${item.id}:${index}`
        const fileName = normalizeParsedFileName(fileDiff.name, item.path)
        codeViewItems.push({
          id,
          type: 'diff',
          fileDiff: {
            ...fileDiff,
            name: fileName,
            prevName: item.oldPath ?? fileDiff.prevName
          },
          collapsed: item.collapsed,
          version: item.version ?? hashDiffVersion(normalizedPatch, item.collapsed)
        })
        sourceItems.set(id, item)
      })
    } catch {
      fallbackItems.push({ id: item.id, path: item.path, message: fallbackMessage })
    }
  }

  return { codeViewItems, fallbackItems, sourceItems }
}

function DiffViewerHeaderPrefix({ item }: { item?: DiffViewerItem }): React.JSX.Element | null {
  const actions = item?.headerActions
  if (!item || !actions) return null

  return (
    <button
      aria-expanded={!item.collapsed}
      aria-label="Toggle diff"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded border text-xs text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        actions.onToggle()
      }}
    >
      {item.collapsed ? '+' : '−'}
    </button>
  )
}

function DiffViewerHeaderMetadata({
  item,
  sourceItem
}: {
  item: CodeViewItem
  sourceItem?: DiffViewerItem
}): React.JSX.Element | null {
  if (item.type !== 'diff') return null
  const metadata = item.fileDiff
  const actions = sourceItem?.headerActions
  const changeMetadata = sourceItem?.changeMetadata
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded border px-2 py-0.5 capitalize">
        {actions?.status ?? changeMetadata?.status ?? formatChangeType(metadata.type)}
      </span>
      {changeMetadata?.deletions !== undefined ? (
        <span className="text-destructive">−{changeMetadata.deletions}</span>
      ) : null}
      {changeMetadata?.additions !== undefined ? (
        <span className="text-emerald-600">+{changeMetadata.additions}</span>
      ) : null}
      {metadata.prevName ? (
        <span className="truncate">renamed from {metadata.prevName}</span>
      ) : null}
      {actions?.onFileNameClick ? (
        <button
          aria-label={sourceItem?.path}
          className="rounded border px-2 py-0.5 text-xs text-foreground underline-offset-2 hover:bg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={actions.fileNameTitle}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            actions.onFileNameClick?.()
          }}
        >
          Open file
        </button>
      ) : null}
    </span>
  )
}

function normalizeParsedFileName(parsedName: string, fallbackPath: string): string {
  if (!parsedName || parsedName === '/dev/null') return fallbackPath
  return parsedName
}

function formatChangeType(type: string): string {
  if (type === 'rename-pure' || type === 'rename-changed') return 'renamed'
  if (type === 'new') return 'added'
  return type
}

function normalizeRenderablePatch(item: DiffViewerItem): string {
  const patch = item.patch
  if (isHunkOnlyPatch(patch)) return withFileHeaders(item, patch)
  if (patch.includes('\n@@ ')) return patch

  const lines = patch.split('\n')
  const newFileHeaderIndex = lines.findIndex((line) => line.startsWith('+++ '))
  if (newFileHeaderIndex === -1) return patch

  const contentLines = lines.slice(newFileHeaderIndex + 1)
  const additionCount = contentLines.filter(
    (line) => line.startsWith('+') && !line.startsWith('+++')
  ).length
  if (additionCount === 0) return patch

  return [
    ...lines.slice(0, newFileHeaderIndex + 1),
    `@@ -0,0 +1,${additionCount} @@`,
    ...contentLines
  ].join('\n')
}

function isHunkOnlyPatch(patch: string): boolean {
  return patch.trimStart().startsWith('@@ ')
}

function withFileHeaders(item: DiffViewerItem, patch: string): string {
  const oldPath = item.oldPath ?? item.path
  return [
    `diff --git a/${oldPath} b/${item.path}`,
    `--- a/${oldPath}`,
    `+++ b/${item.path}`,
    patch
  ].join('\n')
}

function hashDiffVersion(patch: string, collapsed?: boolean): number {
  let hash = collapsed ? 17 : 23
  for (let index = 0; index < patch.length; index += 1) {
    hash = (hash * 31 + patch.charCodeAt(index)) | 0
  }
  return hash
}

function getDocumentResolvedTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
