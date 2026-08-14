import { DotsSixVertical, MagnifyingGlass, Sidebar } from '@phosphor-icons/react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'

import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@renderer/components/sidebar/sidebar-layout'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

export type WorkspaceShellLayoutLabels = {
  hideLeftSidebar: string
  showLeftSidebar: string
  openCommandPalette: string
  mainContent: string
  resizeLeftSidebar: string
}

export type WorkspaceShellLayoutProps = {
  isLeftSidebarOpen: boolean
  leftSidebarWidth: number
  sidePaneHeaderWidth: number | string
  leftSidebar: ReactNode
  titlebarCenter: ReactNode
  sidePaneHeader: ReactNode
  mainContent: ReactNode
  labels: WorkspaceShellLayoutLabels
  onToggleLeftSidebar: () => void
  onOpenCommandPalette: () => void
  onResizeLeftSidebarPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onResizeLeftSidebarKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  overlay?: ReactNode
}

const RESIZE_HANDLE_WIDTH = 4

export function WorkspaceEmptyStateView({
  title,
  description
}: {
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-2 max-w-sm text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function WorkspaceShellLayout({
  isLeftSidebarOpen,
  leftSidebarWidth,
  sidePaneHeaderWidth,
  leftSidebar,
  titlebarCenter,
  sidePaneHeader,
  mainContent,
  labels,
  onToggleLeftSidebar,
  onOpenCommandPalette,
  onResizeLeftSidebarPointerDown,
  onResizeLeftSidebarKeyDown,
  overlay
}: WorkspaceShellLayoutProps): React.JSX.Element {
  const bodyGridTemplateColumns = [
    isLeftSidebarOpen ? `${leftSidebarWidth}px ${RESIZE_HANDLE_WIDTH}px` : '',
    'minmax(0, 1fr)'
  ]
    .filter(Boolean)
    .join(' ')
  const titlebarGridTemplateColumns = [
    isLeftSidebarOpen ? `${leftSidebarWidth}px` : 'minmax(0, 1fr)',
    'minmax(0, 1fr)',
    typeof sidePaneHeaderWidth === 'number' ? `${sidePaneHeaderWidth}px` : sidePaneHeaderWidth
  ].join(' ')

  return (
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header
        className="app-titlebar grid h-12 items-stretch bg-background"
        style={{ gridTemplateColumns: titlebarGridTemplateColumns }}
      >
        <div
          className={cn(
            'flex items-center justify-start px-3',
            isLeftSidebarOpen ? 'border-r border-sidebar-border bg-sidebar' : 'bg-background'
          )}
        >
          <div className="mac-traffic-light-space shrink-0" />
          <div className="titlebar-control flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={isLeftSidebarOpen ? labels.hideLeftSidebar : labels.showLeftSidebar}
              aria-pressed={isLeftSidebarOpen}
              onClick={onToggleLeftSidebar}
            >
              <Sidebar className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={labels.openCommandPalette}
              onClick={onOpenCommandPalette}
            >
              <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex h-full w-full items-center justify-start px-3">{titlebarCenter}</div>

        <div className="flex h-full w-full min-w-0 items-center">{sidePaneHeader}</div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: bodyGridTemplateColumns }}>
        {isLeftSidebarOpen ? leftSidebar : null}
        {isLeftSidebarOpen ? (
          <div
            aria-label={labels.resizeLeftSidebar}
            aria-orientation="vertical"
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuenow={leftSidebarWidth}
            className="titlebar-control flex cursor-col-resize items-center justify-center text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            role="separator"
            tabIndex={0}
            onKeyDown={onResizeLeftSidebarKeyDown}
            onPointerDown={onResizeLeftSidebarPointerDown}
          >
            <DotsSixVertical className="h-4 w-3" aria-hidden="true" />
          </div>
        ) : null}

        <section
          aria-label={labels.mainContent}
          className="flex min-h-0 min-w-0 flex-col bg-background"
          role="main"
        >
          {mainContent}
        </section>
      </div>
      {overlay}
    </div>
  )
}
