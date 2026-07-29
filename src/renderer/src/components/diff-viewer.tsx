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
  const { codeViewItems, fallbackItems } = useMemo(
    () => buildCodeViewItems(items, fallbackMessage),
    [items, fallbackMessage]
  )

  return (
    <div aria-label={ariaLabel} className={cn('bg-muted/20', className)}>
      {codeViewItems.length > 0 ? (
        <CodeView
          disableWorkerPool
          items={codeViewItems}
          options={{
            theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
            themeType: resolvedTheme,
            diffStyle: 'split',
            hunkSeparators: 'line-info-basic',
            overflow: 'scroll',
            stickyHeaders: true
          }}
          renderHeaderMetadata={(item) => <DiffViewerHeaderMetadata item={item} />}
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
): { codeViewItems: CodeViewItem[]; fallbackItems: DiffViewerFallback[] } {
  const codeViewItems: CodeViewItem[] = []
  const fallbackItems: DiffViewerFallback[] = []

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
        const fileName = normalizeParsedFileName(fileDiff.name, item.path)
        codeViewItems.push({
          id: parsedFiles.length === 1 ? item.id : `${item.id}:${index}`,
          type: 'diff',
          fileDiff: {
            ...fileDiff,
            name: fileName,
            prevName: item.oldPath ?? fileDiff.prevName
          },
          collapsed: item.collapsed,
          version: item.version ?? hashDiffVersion(normalizedPatch, item.collapsed)
        })
      })
    } catch {
      fallbackItems.push({ id: item.id, path: item.path, message: fallbackMessage })
    }
  }

  return { codeViewItems, fallbackItems }
}

function DiffViewerHeaderMetadata({ item }: { item: CodeViewItem }): React.JSX.Element | null {
  if (item.type !== 'diff') return null
  const metadata = item.fileDiff
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded border px-2 py-0.5 capitalize">
        {formatChangeType(metadata.type)}
      </span>
      {metadata.prevName ? (
        <span className="truncate">renamed from {metadata.prevName}</span>
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
