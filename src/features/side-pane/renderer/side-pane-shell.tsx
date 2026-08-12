import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode
} from 'react'
import { DotsSixVertical, Plus, Sidebar, X } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

import { useSidePaneStore, type SidePaneCategoryId, type SidePaneTab } from './side-pane-store'

export type SidePaneContextCapabilities =
  | { kind: 'project-home'; projectId: string }
  | { kind: 'project-session'; projectId: string; sessionId: string }
  | { kind: 'global-chat' }
  | { kind: 'knowledge-base' }

export type SidePaneCategoryDescriptor = {
  id: SidePaneCategoryId
  label: string
  available: boolean
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  create?: () => void
  close?: (tab: SidePaneTab) => void
  render?: (context: { contextKey: string; capabilities: SidePaneContextCapabilities }) => ReactNode
}

export type SidePaneConfiguration = {
  contextKey: string
  capabilities: SidePaneContextCapabilities
  defaultCategoryId: SidePaneCategoryId
  defaultOpen?: boolean
  categories: readonly SidePaneCategoryDescriptor[]
}

type SidePaneShellProps = SidePaneConfiguration & {
  children: ReactNode
  showInlineHeaderTabs?: boolean
}

export const SIDE_PANE_COLLAPSED_HEADER_WIDTH = 48
export const SIDE_PANE_HANDLE_WIDTH = 4
const SIDE_PANE_DEFAULT_RATIO = 0.6
const SIDE_PANE_MIN_WIDTH = 400
const PRIMARY_CONTENT_MIN_WIDTH = 360
const SIDE_PANE_RESIZE_STEP = 24

export function SidePaneShell({
  contextKey,
  capabilities,
  defaultCategoryId,
  defaultOpen,
  categories,
  children,
  showInlineHeaderTabs = true
}: SidePaneShellProps): React.JSX.Element {
  const configuration = { contextKey, capabilities, defaultCategoryId, defaultOpen, categories }
  const controller = useSidePaneController(configuration)
  const savedState = useSidePaneStore((state) => state.contexts[contextKey])
  const openDefaultCategory = useSidePaneStore((state) => state.openCategory)
  const reconcileCategories = useSidePaneStore((state) => state.reconcileCategories)
  const setWidth = useSidePaneStore((state) => state.setWidth)
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedDefaultOpenContextsRef = useRef(new Set<string>())
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth)
  const activeCategory = categories.find(
    (category) => category.id === controller.activeTab?.categoryId
  )
  const { minWidth, maxWidth } = getSidePaneWidthLimits(containerWidth)
  const renderedWidth = getRenderedSidePaneWidth(containerWidth, savedState?.width)
  const availableCategoryIds = useMemo(
    () => categories.filter((category) => category.available).map((category) => category.id),
    [categories]
  )

  useLayoutEffect(() => {
    reconcileCategories(contextKey, availableCategoryIds, defaultCategoryId)
  }, [availableCategoryIds, contextKey, defaultCategoryId, reconcileCategories])

  useLayoutEffect(() => {
    if (!defaultOpen || initializedDefaultOpenContextsRef.current.has(contextKey)) return
    initializedDefaultOpenContextsRef.current.add(contextKey)
    if (!savedState || savedState.tabs.length === 0) {
      openDefaultCategory(contextKey, defaultCategoryId)
    }
  }, [contextKey, defaultCategoryId, defaultOpen, openDefaultCategory, savedState])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const initialWidth = Math.round(container.getBoundingClientRect().width)
    if (initialWidth > 0) setContainerWidth(initialWidth)
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0)
      if (width > 0) setContainerWidth(width)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  function resizeSidePane(nextWidth: number): void {
    setWidth(contextKey, clampSidePaneWidth(nextWidth, minWidth, maxWidth))
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = renderedWidth
    function handlePointerMove(moveEvent: PointerEvent): void {
      resizeSidePane(startWidth - (moveEvent.clientX - startX))
    }
    function handlePointerUp(): void {
      window.removeEventListener('pointermove', handlePointerMove)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>): void {
    let nextWidth = renderedWidth
    if (event.key === 'ArrowLeft') nextWidth += SIDE_PANE_RESIZE_STEP
    if (event.key === 'ArrowRight') nextWidth -= SIDE_PANE_RESIZE_STEP
    if (event.key === 'Home') nextWidth = minWidth
    if (event.key === 'End') nextWidth = maxWidth
    if (nextWidth === renderedWidth) return
    event.preventDefault()
    resizeSidePane(nextWidth)
  }

  return (
    <div ref={containerRef} className="relative flex min-h-0 min-w-0 flex-1 bg-background">
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{
          paddingRight:
            !controller.isOpen && controller.canOpen ? SIDE_PANE_COLLAPSED_HEADER_WIDTH : undefined
        }}
      >
        {children}
      </div>
      {controller.isOpen && activeCategory ? (
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
            onKeyDown={resizeWithKeyboard}
            onPointerDown={startResize}
          >
            <DotsSixVertical aria-hidden className="h-4 w-3" />
          </div>
          <aside
            aria-label="Side Pane"
            className="flex min-h-0 shrink-0 flex-col border-l bg-background"
            style={{ minWidth, width: renderedWidth }}
          >
            {showInlineHeaderTabs ? (
              <SidePaneTabStrip
                activeTabId={controller.activeTab?.id ?? null}
                categories={categories}
                contextKey={contextKey}
                tabs={controller.tabs}
                onActivate={controller.activateTab}
                onClose={controller.closeTab}
                onCreateCategory={controller.createCategory}
                onReorder={controller.reorderTab}
              />
            ) : null}
            <div
              id={`${contextKey}-${controller.activeTab?.id ?? 'active'}-panel`}
              className="min-h-0 flex-1 overflow-auto"
              role="tabpanel"
            >
              {activeCategory.render?.({ contextKey, capabilities })}
            </div>
          </aside>
        </>
      ) : (
        <SidePaneLauncher categories={categories} onSelect={controller.openCategory} />
      )}
    </div>
  )
}

export function useSidePaneController(configuration: SidePaneConfiguration | null): {
  activeTab: SidePaneTab | null
  canOpen: boolean
  isOpen: boolean
  tabs: SidePaneTab[]
  activateTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  collapse: () => void
  createCategory: (categoryId: SidePaneCategoryId) => void
  openCategory: (categoryId: SidePaneCategoryId) => void
  reorderTab: (sourceId: string, targetId: string, position: 'before' | 'after') => void
  toggle: () => void
} {
  const contextKey = configuration?.contextKey ?? ''
  const savedState = useSidePaneStore((state) => state.contexts[contextKey])
  const activateTabInContext = useSidePaneStore((state) => state.activateTab)
  const closeTabInContext = useSidePaneStore((state) => state.closeTab)
  const collapseContext = useSidePaneStore((state) => state.collapse)
  const openCategoryInContext = useSidePaneStore((state) => state.openCategory)
  const reorderTabInContext = useSidePaneStore((state) => state.reorderTab)
  const availableCategories =
    configuration?.categories.filter((category) => category.available) ?? []
  const tabs = savedState?.tabs ?? []
  const activeTab = tabs.find((tab) => tab.id === savedState?.activeTabId) ?? null
  const isOpen = Boolean(activeTab && savedState?.isOpen)

  const collapse = useCallback(() => {
    if (configuration) collapseContext(configuration.contextKey)
  }, [collapseContext, configuration])

  const openCategory = useCallback(
    (categoryId: SidePaneCategoryId) => {
      const category = configuration?.categories.find((candidate) => candidate.id === categoryId)
      if (configuration && category?.available) {
        openCategoryInContext(configuration.contextKey, categoryId)
      }
    },
    [configuration, openCategoryInContext]
  )

  const createCategory = useCallback(
    (categoryId: SidePaneCategoryId) => {
      const category = configuration?.categories.find((candidate) => candidate.id === categoryId)
      if (!configuration || !category?.available) return
      if (category.create) category.create()
      else openCategoryInContext(configuration.contextKey, categoryId)
    },
    [configuration, openCategoryInContext]
  )

  const toggle = useCallback(() => {
    if (!configuration || availableCategories.length === 0) return
    if (isOpen) collapse()
    else openCategory(activeTab?.categoryId ?? configuration.defaultCategoryId)
  }, [
    activeTab?.categoryId,
    availableCategories.length,
    collapse,
    configuration,
    isOpen,
    openCategory
  ])

  return {
    activeTab,
    canOpen: availableCategories.length > 0,
    isOpen,
    tabs,
    activateTab: (tabId) => {
      if (configuration) activateTabInContext(configuration.contextKey, tabId)
    },
    closeTab: (tabId) => {
      if (!configuration) return
      const tab = savedState?.tabs.find((candidate) => candidate.id === tabId)
      const category = configuration.categories.find(
        (candidate) => candidate.id === tab?.categoryId
      )
      if (tab && category?.close) category.close(tab)
      else closeTabInContext(configuration.contextKey, tabId)
    },
    collapse,
    createCategory,
    openCategory,
    reorderTab: (sourceId, targetId, position) => {
      if (configuration) {
        reorderTabInContext(configuration.contextKey, sourceId, targetId, position)
      }
    },
    toggle
  }
}

function SidePaneLauncher({
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

function SidePaneTabStrip({
  activeTabId,
  categories,
  contextKey,
  tabs,
  onActivate,
  onClose,
  onCreateCategory,
  onReorder
}: {
  activeTabId: string | null
  categories: readonly SidePaneCategoryDescriptor[]
  contextKey: string
  tabs: SidePaneTab[]
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onCreateCategory: (categoryId: SidePaneCategoryId) => void
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}): React.JSX.Element {
  return (
    <div className="titlebar-control flex h-9 min-w-0 flex-1 shrink-0 border-b bg-muted/40 p-1">
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
              contextKey={contextKey}
              tab={tab}
              tabs={tabs}
              onActivate={onActivate}
              onClose={onClose}
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
  contextKey,
  tab,
  tabs,
  onActivate,
  onClose,
  onReorder
}: {
  active: boolean
  category: SidePaneCategoryDescriptor
  contextKey: string
  tab: SidePaneTab
  tabs: SidePaneTab[]
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}): React.JSX.Element {
  const tabRef = useRef<HTMLDivElement>(null)
  const Icon = category.icon
  const label = tab.title ?? category.label

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

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
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
        aria-controls={`${contextKey}-${tab.id}-panel`}
        aria-selected={active}
        data-side-pane-tab-id={tab.id}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-t-md px-2 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="tab"
        tabIndex={active ? 0 : -1}
        type="button"
        onClick={() => onActivate(tab.id)}
        onKeyDown={handleKeyDown}
      >
        {tab.categoryId === 'browser' && tab.faviconUrl ? (
          <img
            alt=""
            className="size-3.5 shrink-0"
            src={tab.faviconUrl}
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <Icon aria-hidden className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </button>
      <button
        aria-label={`Close ${label}`}
        className="absolute right-1 flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 group-focus-within:opacity-100"
        type="button"
        onClick={() => onClose(tab.id)}
      >
        <X aria-hidden className="size-3" />
      </button>
    </div>
  )
}

export function SidePaneHeaderControls({
  configuration
}: {
  configuration: SidePaneConfiguration | null
}): React.JSX.Element {
  const controller = useSidePaneController(configuration)
  return (
    <div
      aria-label="Side Pane header controls"
      className={`flex h-full w-full min-w-0 flex-1 items-center justify-between ${
        configuration && controller.isOpen ? 'border-b border-l' : 'pr-3'
      }`}
    >
      {configuration && controller.isOpen ? (
        <SidePaneTabStrip
          activeTabId={controller.activeTab?.id ?? null}
          categories={configuration.categories}
          contextKey={configuration.contextKey}
          tabs={controller.tabs}
          onActivate={controller.activateTab}
          onClose={controller.closeTab}
          onCreateCategory={controller.createCategory}
          onReorder={controller.reorderTab}
        />
      ) : (
        <div aria-hidden="true" className="min-w-0 flex-1" />
      )}
      <div className="titlebar-control shrink-0 px-1">
        <SidePaneToggleButton configuration={configuration} />
      </div>
    </div>
  )
}

export function getRenderedSidePaneWidth(
  containerWidth: number,
  savedWidth: number | null | undefined
): number {
  const { minWidth, maxWidth } = getSidePaneWidthLimits(containerWidth)
  const defaultWidth = clampSidePaneWidth(
    Math.round(containerWidth * SIDE_PANE_DEFAULT_RATIO),
    minWidth,
    maxWidth
  )
  return clampSidePaneWidth(savedWidth ?? defaultWidth, minWidth, maxWidth)
}

function getSidePaneWidthLimits(containerWidth: number): { minWidth: number; maxWidth: number } {
  const maxWidth = Math.max(0, containerWidth - PRIMARY_CONTENT_MIN_WIDTH - SIDE_PANE_HANDLE_WIDTH)
  return { minWidth: Math.min(SIDE_PANE_MIN_WIDTH, maxWidth), maxWidth }
}

function clampSidePaneWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, width))
}

export function SidePaneToggleButton({
  configuration
}: {
  configuration: SidePaneConfiguration | null
}): React.JSX.Element {
  const controller = useSidePaneController(configuration)
  return (
    <Button
      aria-label="Toggle Side Pane"
      aria-pressed={controller.isOpen}
      disabled={!controller.canOpen && !controller.isOpen}
      size="icon-sm"
      variant="ghost"
      onClick={controller.toggle}
    >
      <Sidebar aria-hidden className="h-4 w-4 rotate-180" />
    </Button>
  )
}
