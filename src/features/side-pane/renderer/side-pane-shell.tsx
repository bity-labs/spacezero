import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode
} from 'react'
import { Sidebar } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'

import { SidePaneShellView, SidePaneTabStripView } from './side-pane-shell-view'
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
  open?: () => void
  create?: () => void
  close?: (tab: SidePaneTab) => void
  render?: (context: {
    contextKey: string
    capabilities: SidePaneContextCapabilities
    activeTab: SidePaneTab
  }) => ReactNode
  renderTabIcon?: (tab: SidePaneTab) => ReactNode
  onActivateTab?: (tab: SidePaneTab) => void
  onDoubleClickTab?: (tab: SidePaneTab) => void
  onRequestCloseTab?: (tab: SidePaneTab) => boolean | Promise<boolean>
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

  const activeContent = controller.activeTab
    ? activeCategory?.render?.({ contextKey, capabilities, activeTab: controller.activeTab })
    : null

  return (
    <SidePaneShellView
      activeContent={activeContent}
      activeTabId={controller.activeTab?.id ?? null}
      canOpen={controller.canOpen}
      categories={categories}
      categoryMru={savedState?.categoryMru ?? {}}
      containerRef={containerRef}
      contextKey={contextKey}
      isOpen={Boolean(controller.isOpen && activeCategory)}
      maxWidth={maxWidth}
      minWidth={minWidth}
      renderedWidth={renderedWidth}
      showInlineHeaderTabs={showInlineHeaderTabs}
      tabs={controller.tabs}
      onActivateTab={controller.activateTab}
      onCloseTab={controller.closeTab}
      onCreateCategory={controller.createCategory}
      onOpenCategory={controller.openCategory}
      onReorderTab={controller.reorderTab}
      onResizeKeyDown={resizeWithKeyboard}
      onResizePointerDown={startResize}
    >
      {children}
    </SidePaneShellView>
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
      if (!configuration || !category?.available) return
      if (category.open) category.open()
      else openCategoryInContext(configuration.contextKey, categoryId)
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

export function SidePaneHeaderControls({
  configuration
}: {
  configuration: SidePaneConfiguration | null
}): React.JSX.Element {
  const controller = useSidePaneController(configuration)
  const savedState = useSidePaneStore((state) =>
    configuration ? state.contexts[configuration.contextKey] : undefined
  )
  const categoryMru = savedState?.categoryMru ?? {}
  return (
    <div
      aria-label="Side Pane header controls"
      className={`flex h-full w-full min-w-0 flex-1 items-center justify-between ${
        configuration && controller.isOpen ? 'border-b border-l' : 'pr-3'
      }`}
    >
      {configuration && controller.isOpen ? (
        <SidePaneTabStripView
          activeTabId={controller.activeTab?.id ?? null}
          categories={configuration.categories}
          categoryMru={categoryMru}
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
