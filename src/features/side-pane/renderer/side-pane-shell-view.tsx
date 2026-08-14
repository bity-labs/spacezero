import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref
} from 'react'
import { DotsSixVertical, Plus, X } from '@phosphor-icons/react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

import type { SidePaneCategoryDescriptor } from './side-pane-shell'
import type { SidePaneCategoryId, SidePaneTab } from './side-pane-store'

export type SidePaneShellViewProps = {
  activeContent?: ReactNode
  activeTabId: string | null
  canOpen: boolean
  categories: readonly SidePaneCategoryDescriptor[]
  categoryMru: Partial<Record<SidePaneCategoryId, string>>
  children: ReactNode
  containerRef?: Ref<HTMLDivElement>
  contextKey: string
  isOpen: boolean
  maxWidth: number
  minWidth: number
  renderedWidth: number
  showInlineHeaderTabs?: boolean
  tabs: SidePaneTab[]
  onActivateTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onCreateCategory: (categoryId: SidePaneCategoryId) => void
  onOpenCategory: (categoryId: SidePaneCategoryId) => void
  onReorderTab: (sourceId: string, targetId: string, position: 'before' | 'after') => void
  onResizeKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  onResizePointerDown?: (event: PointerEvent<HTMLDivElement>) => void
}

export function SidePaneShellView({
  activeContent,
  activeTabId,
  canOpen,
  categories,
  categoryMru,
  children,
  containerRef,
  contextKey,
  isOpen,
  maxWidth,
  minWidth,
  renderedWidth,
  showInlineHeaderTabs = true,
  tabs,
  onActivateTab,
  onCloseTab,
  onCreateCategory,
  onOpenCategory,
  onReorderTab,
  onResizeKeyDown,
  onResizePointerDown
}: SidePaneShellViewProps): React.JSX.Element {
  const activeCategoryId = tabs.find((tab) => tab.id === activeTabId)?.categoryId

  return (
    <div ref={containerRef} className="relative flex min-h-0 min-w-0 flex-1 bg-background">
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{ paddingRight: !isOpen && canOpen ? 48 : undefined }}
      >
        {children}
      </div>
      {isOpen ? (
        <>
          <div
            aria-label="Resize Side Pane"
            aria-orientation="vertical"
            aria-valuemax={maxWidth}
            aria-valuemin={minWidth}
            aria-valuenow={renderedWidth}
            className="flex w-1 shrink-0 cursor-col-resize items-center justify-center text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            role="separator"
            tabIndex={0}
            onKeyDown={onResizeKeyDown}
            onPointerDown={onResizePointerDown}
          >
            <DotsSixVertical aria-hidden className="h-4 w-3" />
          </div>
          <aside
            aria-label="Side Pane"
            className="flex min-h-0 shrink-0 flex-col border-l bg-background"
            style={{ minWidth, width: renderedWidth }}
          >
            {showInlineHeaderTabs ? (
              <SidePaneTabStripView
                activeTabId={activeTabId}
                categories={categories}
                categoryMru={categoryMru}
                contextKey={contextKey}
                tabs={tabs}
                onActivate={onActivateTab}
                onClose={onCloseTab}
                onCreateCategory={onCreateCategory}
                onReorder={onReorderTab}
              />
            ) : null}
            <div
              id={activeCategoryId ? `${contextKey}-${activeCategoryId}-panel` : undefined}
              className="min-h-0 flex-1 overflow-auto"
              role="tabpanel"
            >
              {activeContent}
            </div>
          </aside>
        </>
      ) : (
        <SidePaneLauncherView categories={categories} onSelect={onOpenCategory} />
      )}
    </div>
  )
}

export function SidePaneLauncherView({
  categories,
  onSelect
}: {
  categories: readonly SidePaneCategoryDescriptor[]
  onSelect: (categoryId: SidePaneCategoryId) => void
}): React.JSX.Element {
  return (
    <div
      aria-label="Side Pane launcher"
      aria-orientation="vertical"
      className="absolute right-2 top-2 z-10 flex flex-col gap-1 rounded-lg border bg-background p-1 shadow-sm"
      role="toolbar"
    >
      {categories.map((category) => {
        const Icon = category.icon
        return (
          <button
            key={category.id}
            aria-label={category.available ? category.label : `${category.label} — Coming soon`}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!category.available}
            type="button"
            onClick={() => onSelect(category.id)}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        )
      })}
    </div>
  )
}

export function SidePaneTabStripView({
  activeTabId,
  categories,
  categoryMru,
  contextKey,
  tabs,
  onActivate,
  onClose,
  onCreateCategory,
  onReorder
}: {
  activeTabId: string | null
  categories: readonly SidePaneCategoryDescriptor[]
  categoryMru: Partial<Record<SidePaneCategoryId, string>>
  contextKey: string
  tabs: SidePaneTab[]
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onCreateCategory: (categoryId: SidePaneCategoryId) => void
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}): React.JSX.Element {
  function activateTab(tabId: string): void {
    const tab = tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return
    onActivate(tabId)
    categories.find((category) => category.id === tab.categoryId)?.onActivateTab?.(tab)
  }

  function requestCloseTab(tab: SidePaneTab): void {
    const category = categories.find((candidate) => candidate.id === tab.categoryId)
    void Promise.resolve(category?.onRequestCloseTab?.(tab) ?? true).then((canClose) => {
      if (canClose) onClose(tab.id)
    })
  }

  return (
    <div className="titlebar-control flex h-9 min-w-0 shrink-0 border-b bg-muted/40 p-1">
      <div
        aria-label="Side Pane Tabs"
        className="flex min-w-0 flex-1 overflow-x-auto"
        role="tablist"
      >
        {tabs.map((tab) => {
          const category = categories.find((candidate) => candidate.id === tab.categoryId)
          if (!category) return null
          return (
            <SidePaneTabButton
              key={tab.id}
              active={activeTabId === tab.id}
              category={category}
              categoryMru={categoryMru[tab.categoryId] === tab.id}
              contextKey={contextKey}
              tab={tab}
              tabs={tabs}
              onActivate={activateTab}
              onClose={() => requestCloseTab(tab)}
              onDoubleClick={() => category.onDoubleClickTab?.(tab)}
              onReorder={onReorder}
            />
          )
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Create Side Pane Tab"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Plus aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {categories
            .filter((category) => category.available)
            .map((category) => {
              const Icon = category.icon
              return (
                <DropdownMenuItem key={category.id} onClick={() => onCreateCategory(category.id)}>
                  <Icon className="size-4" />
                  {category.label}
                </DropdownMenuItem>
              )
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SidePaneTabButton({
  active,
  category,
  categoryMru,
  contextKey,
  tab,
  tabs,
  onActivate,
  onClose,
  onDoubleClick,
  onReorder
}: {
  active: boolean
  category: SidePaneCategoryDescriptor
  categoryMru: boolean
  contextKey: string
  tab: SidePaneTab
  tabs: SidePaneTab[]
  onActivate: (tabId: string) => void
  onClose: () => void
  onDoubleClick: () => void
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}): React.JSX.Element {
  const tabRef = useRef<HTMLDivElement>(null)
  const Icon = category.icon
  const label = tab.label ?? tab.title ?? category.label
  const renderedIcon =
    tab.categoryId === 'browser' && tab.faviconUrl ? (
      <img
        alt=""
        className="size-3.5 shrink-0"
        src={tab.faviconUrl}
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
    ) : (
      (category.renderTabIcon?.(tab) ?? <Icon aria-hidden className="size-3.5 shrink-0" />)
    )

  useEffect(() => {
    if (!active || !tabRef.current) return
    const container = tabRef.current.parentElement
    if (!container) return
    const tabRect = tabRef.current.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    if (tabRect.right > containerRect.right)
      container.scrollLeft += tabRect.right - containerRect.right
    else if (tabRect.left < containerRect.left)
      container.scrollLeft -= containerRect.left - tabRect.left
  }, [active])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const index = tabs.findIndex((candidate) => candidate.id === tab.id)
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (direction === 0) return
    const target = tabs[index + direction]
    if (!target) return
    event.preventDefault()
    if (event.altKey && event.shiftKey) {
      onReorder(tab.id, target.id, direction < 0 ? 'before' : 'after')
    } else {
      onActivate(target.id)
      const targetButton = tabRef.current?.parentElement?.querySelector<HTMLElement>(
        `[data-side-pane-tab-id="${target.id}"]`
      )
      targetButton?.focus()
    }
  }

  return (
    <div
      ref={tabRef}
      className="group relative flex h-8 min-w-20 max-w-32 shrink-0 items-center rounded-t-md"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', tab.id)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const sourceId = event.dataTransfer.getData('text/plain')
        const bounds = event.currentTarget.getBoundingClientRect()
        onReorder(
          sourceId,
          tab.id,
          event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after'
        )
      }}
    >
      <button
        aria-controls={`${contextKey}-${tab.categoryId}-panel`}
        aria-label={`${tab.dirty ? 'Modified ' : ''}${label}${tab.preview ? ' preview' : ''}`}
        aria-selected={active}
        data-side-pane-category-id={tab.categoryId}
        data-side-pane-category-mru={categoryMru ? 'true' : undefined}
        data-side-pane-resource-id={tab.resourceId}
        data-side-pane-tab-id={tab.id}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-t-md px-2 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="tab"
        tabIndex={active ? 0 : -1}
        type="button"
        onClick={() => onActivate(tab.id)}
        onDoubleClick={onDoubleClick}
        onKeyDown={handleKeyDown}
      >
        {renderedIcon}
        {tab.dirty ? <span aria-hidden>●</span> : null}
        <span className={`truncate ${tab.preview ? 'italic' : ''}`}>{label}</span>
        {tab.preview ? <span className="sr-only"> preview</span> : null}
      </button>
      <button
        aria-label={`Close ${label}`}
        className="absolute right-1 flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 group-focus-within:opacity-100"
        type="button"
        onClick={onClose}
      >
        <X aria-hidden className="size-3" />
      </button>
    </div>
  )
}
