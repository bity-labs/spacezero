import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode
} from 'react'
import { DotsSixVertical, Sidebar } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

import { useToolPaneStore } from './tool-pane-store'

export type ToolId = 'files' | 'git' | 'browser' | 'terminal'

export type ToolPaneContextCapabilities =
  | { kind: 'project-session'; projectId: string; sessionId: string }
  | { kind: 'workspace-session'; sessionId: string }
  | { kind: 'knowledge-base' }

export type ToolDescriptor = {
  id: ToolId
  label: string
  available: boolean
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  render?: (context: { contextKey: string; capabilities: ToolPaneContextCapabilities }) => ReactNode
}

export type ToolPaneConfiguration = {
  contextKey: string
  capabilities: ToolPaneContextCapabilities
  defaultToolId: ToolId
  tools: readonly ToolDescriptor[]
}

type ToolPaneShellProps = ToolPaneConfiguration & {
  children: ReactNode
  showInlineHeaderSwitcher?: boolean
}

export const TOOL_PANE_COLLAPSED_HEADER_WIDTH = 48

const TOOL_PANE_DEFAULT_RATIO = 0.6
const TOOL_PANE_MIN_WIDTH = 400
const CHAT_MIN_WIDTH = 360
export const TOOL_PANE_HANDLE_WIDTH = 4
const TOOL_PANE_RESIZE_STEP = 24

export function ToolPaneShell({
  contextKey,
  capabilities,
  defaultToolId,
  tools,
  children,
  showInlineHeaderSwitcher = true
}: ToolPaneShellProps): React.JSX.Element {
  const configuration = { contextKey, capabilities, defaultToolId, tools }
  const controller = useToolPaneController(configuration)
  const savedState = useToolPaneStore((state) => state.contexts[contextKey])
  const setWidth = useToolPaneStore((state) => state.setWidth)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth)
  const activeTool = controller.activeTool
  const isOpen = controller.isOpen
  const { minWidth, maxWidth } = getToolPaneWidthLimits(containerWidth)
  const renderedWidth = getRenderedToolPaneWidth(containerWidth, savedState?.width)

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

  function resizeToolPane(nextWidth: number): void {
    setWidth(contextKey, clampToolPaneWidth(nextWidth, minWidth, maxWidth))
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = renderedWidth

    function handlePointerMove(moveEvent: PointerEvent): void {
      resizeToolPane(startWidth - (moveEvent.clientX - startX))
    }

    function handlePointerUp(): void {
      window.removeEventListener('pointermove', handlePointerMove)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>): void {
    let nextWidth = renderedWidth
    if (event.key === 'ArrowLeft') nextWidth += TOOL_PANE_RESIZE_STEP
    if (event.key === 'ArrowRight') nextWidth -= TOOL_PANE_RESIZE_STEP
    if (event.key === 'Home') nextWidth = minWidth
    if (event.key === 'End') nextWidth = maxWidth
    if (nextWidth === renderedWidth) return
    event.preventDefault()
    resizeToolPane(nextWidth)
  }

  return (
    <div ref={containerRef} className="relative flex min-h-0 min-w-0 flex-1 bg-background">
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{
          minWidth: isOpen
            ? Math.min(
                CHAT_MIN_WIDTH,
                Math.max(0, containerWidth - minWidth - TOOL_PANE_HANDLE_WIDTH)
              )
            : 0
        }}
      >
        {children}
      </div>
      {isOpen && activeTool ? (
        <>
          <div
            aria-label="Resize Tool Pane"
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
            aria-label="Tool Pane"
            className="flex min-h-0 shrink-0 flex-col border-l bg-background"
            style={{
              minWidth,
              width: renderedWidth
            }}
          >
            {showInlineHeaderSwitcher ? (
              <div className="flex h-11 shrink-0 items-center border-b px-2">
                <ToolSwitcher
                  activeToolId={activeTool.id}
                  orientation="horizontal"
                  tools={tools}
                  onSelect={controller.selectTool}
                />
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto">
              {activeTool.render?.({ contextKey, capabilities })}
            </div>
          </aside>
        </>
      ) : (
        <ToolSwitcher
          activeToolId={activeTool?.id ?? null}
          orientation="vertical"
          tools={tools}
          onSelect={controller.selectTool}
        />
      )}
    </div>
  )
}

export function ToolPaneHeaderControls({
  configuration
}: {
  configuration: ToolPaneConfiguration | null
}): React.JSX.Element {
  const controller = useToolPaneController(configuration)

  return (
    <div
      aria-label="Tool Pane header controls"
      className={cn(
        'flex h-full w-full min-w-0 flex-1 items-center justify-between',
        configuration && controller.isOpen && controller.activeTool
          ? 'gap-2 border-b border-l px-2'
          : 'pr-3'
      )}
    >
      {configuration && controller.isOpen && controller.activeTool ? (
        <ToolSwitcher
          activeToolId={controller.activeTool.id}
          orientation="horizontal"
          tools={configuration.tools}
          onSelect={controller.selectTool}
        />
      ) : (
        <div aria-hidden="true" className="min-w-0 flex-1" />
      )}
      <ToolPaneToggleButton configuration={configuration} />
    </div>
  )
}

export function ToolPaneToggleButton({
  configuration
}: {
  configuration: ToolPaneConfiguration | null
}): React.JSX.Element {
  const controller = useToolPaneController(configuration)

  return (
    <Button
      aria-label="Toggle Tool Pane"
      aria-pressed={controller.isOpen}
      className="titlebar-control shrink-0 text-muted-foreground"
      disabled={!controller.canOpen && !controller.isOpen}
      size="icon-sm"
      variant="ghost"
      onClick={controller.toggle}
    >
      <Sidebar aria-hidden className="h-4 w-4 rotate-180" />
    </Button>
  )
}

export function useToolPaneController(configuration: ToolPaneConfiguration | null): {
  activeTool: ToolDescriptor | null
  canOpen: boolean
  isOpen: boolean
  collapse: () => void
  selectTool: (toolId: ToolId) => void
  toggle: () => void
} {
  const contextKey = configuration?.contextKey ?? ''
  const savedState = useToolPaneStore((state) => state.contexts[contextKey])
  const collapseContext = useToolPaneStore((state) => state.collapse)
  const openTool = useToolPaneStore((state) => state.openTool)
  const activeTool = configuration
    ? resolveActiveTool(configuration.tools, configuration.defaultToolId, savedState?.activeToolId)
    : null
  const isOpen = Boolean(savedState?.isOpen && activeTool)

  const collapse = useCallback((): void => {
    if (configuration) collapseContext(configuration.contextKey)
  }, [collapseContext, configuration])

  const selectTool = useCallback(
    (toolId: ToolId): void => {
      const tool = configuration?.tools.find((candidate) => candidate.id === toolId)
      if (configuration && tool?.available) openTool(configuration.contextKey, toolId)
    },
    [configuration, openTool]
  )

  const toggle = useCallback((): void => {
    if (!configuration || !activeTool) return
    if (isOpen) collapse()
    else openTool(configuration.contextKey, activeTool.id)
  }, [activeTool, collapse, configuration, isOpen, openTool])

  return {
    activeTool,
    canOpen: activeTool !== null,
    isOpen,
    collapse,
    selectTool,
    toggle
  }
}

function resolveActiveTool(
  tools: readonly ToolDescriptor[],
  defaultToolId: ToolId,
  savedToolId: ToolId | null | undefined
): ToolDescriptor | null {
  const availableTools = tools.filter((tool) => tool.available)
  return (
    availableTools.find((tool) => tool.id === savedToolId) ??
    availableTools.find((tool) => tool.id === defaultToolId) ??
    availableTools[0] ??
    null
  )
}

export function getRenderedToolPaneWidth(
  containerWidth: number,
  savedWidth: number | null | undefined
): number {
  const { minWidth, maxWidth } = getToolPaneWidthLimits(containerWidth)
  const defaultWidth = clampToolPaneWidth(
    Math.round(containerWidth * TOOL_PANE_DEFAULT_RATIO),
    minWidth,
    maxWidth
  )
  return clampToolPaneWidth(savedWidth ?? defaultWidth, minWidth, maxWidth)
}

function getToolPaneWidthLimits(containerWidth: number): { minWidth: number; maxWidth: number } {
  const maxWidth = Math.max(0, containerWidth - CHAT_MIN_WIDTH - TOOL_PANE_HANDLE_WIDTH)
  return { minWidth: Math.min(TOOL_PANE_MIN_WIDTH, maxWidth), maxWidth }
}

function clampToolPaneWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, width))
}

function ToolSwitcher({
  activeToolId,
  orientation,
  tools,
  onSelect
}: {
  activeToolId: ToolId | null
  orientation: 'horizontal' | 'vertical'
  tools: readonly ToolDescriptor[]
  onSelect: (toolId: ToolId) => void
}): React.JSX.Element {
  return (
    <div
      aria-label="Tool Switcher"
      aria-orientation={orientation}
      className={cn(
        'titlebar-control',
        orientation === 'vertical'
          ? 'absolute right-2 top-2 z-10 flex flex-col gap-1 rounded-lg border bg-background p-1 shadow-sm'
          : 'flex min-w-0 items-center gap-1'
      )}
      role="toolbar"
    >
      {tools.map((tool) => {
        const Icon = tool.icon
        return (
          <button
            key={tool.id}
            aria-label={tool.available ? tool.label : `${tool.label} — Coming soon`}
            aria-pressed={tool.available ? activeToolId === tool.id : undefined}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!tool.available}
            type="button"
            onClick={() => onSelect(tool.id)}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
