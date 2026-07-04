import { useCallback, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Sidebar } from '@phosphor-icons/react'

import { Button } from './components/ui/button'

const LEFT_PANEL_DEFAULT_WIDTH = 280
const RIGHT_PANEL_DEFAULT_WIDTH = 320
const PANEL_MIN_WIDTH = 220
const PANEL_MAX_WIDTH = 520
const KEYBOARD_RESIZE_STEP = 24

type ResizablePanel = 'left' | 'right'

function clampPanelWidth(width: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width))
}

export function App(): React.JSX.Element {
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useState(LEFT_PANEL_DEFAULT_WIDTH)
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH)

  const resizePanel = useCallback((panel: ResizablePanel, width: number) => {
    const setWidth = panel === 'left' ? setLeftPanelWidth : setRightPanelWidth
    setWidth(clampPanelWidth(width))
  }, [])

  const startResize = useCallback(
    (panel: ResizablePanel, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()

      const startX = event.clientX
      const startWidth = panel === 'left' ? leftPanelWidth : rightPanelWidth

      function handlePointerMove(moveEvent: globalThis.PointerEvent): void {
        const pointerDelta = moveEvent.clientX - startX
        const nextWidth = panel === 'left' ? startWidth + pointerDelta : startWidth - pointerDelta
        resizePanel(panel, nextWidth)
      }

      function handlePointerUp(): void {
        window.removeEventListener('pointermove', handlePointerMove)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp, { once: true })
    },
    [leftPanelWidth, resizePanel, rightPanelWidth]
  )

  const resizeWithKeyboard = useCallback(
    (panel: ResizablePanel, event: KeyboardEvent<HTMLDivElement>) => {
      const currentWidth = panel === 'left' ? leftPanelWidth : rightPanelWidth
      let nextWidth = currentWidth

      if (event.key === 'Home') nextWidth = PANEL_MIN_WIDTH
      if (event.key === 'End') nextWidth = PANEL_MAX_WIDTH
      if (event.key === 'ArrowLeft') nextWidth = currentWidth + (panel === 'right' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP)
      if (event.key === 'ArrowRight') nextWidth = currentWidth + (panel === 'left' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP)

      if (nextWidth !== currentWidth) {
        event.preventDefault()
        resizePanel(panel, nextWidth)
      }
    },
    [leftPanelWidth, resizePanel, rightPanelWidth]
  )

  const gridTemplateColumns = [
    isLeftPanelOpen ? `${leftPanelWidth}px 4px` : '',
    'minmax(0, 1fr)',
    isRightPanelOpen ? `4px ${rightPanelWidth}px` : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header className="app-titlebar grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background px-3">
        <div className="flex items-center justify-start">
          <div className="mac-traffic-light-space shrink-0" />
          <div className="titlebar-control flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={isLeftPanelOpen ? 'Hide left panel' : 'Show left panel'}
              aria-pressed={isLeftPanelOpen}
              onClick={() => setIsLeftPanelOpen((isOpen) => !isOpen)}
            >
              <Sidebar className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="text-sm font-medium text-muted-foreground">Space Zero</div>

        <div className="titlebar-control flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={isRightPanelOpen ? 'Hide right panel' : 'Show right panel'}
            aria-pressed={isRightPanelOpen}
            onClick={() => setIsRightPanelOpen((isOpen) => !isOpen)}
          >
            <Sidebar className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns }}>
        {isLeftPanelOpen ? (
          <aside aria-label="Left panel" className="min-w-0 border-r border-border bg-card p-4">
            <h2 className="text-sm font-medium">Left panel</h2>
          </aside>
        ) : null}

        {isLeftPanelOpen ? (
          <ResizeHandle
            label="Resize left panel"
            value={leftPanelWidth}
            onPointerDown={(event) => startResize('left', event)}
            onKeyDown={(event) => resizeWithKeyboard('left', event)}
          />
        ) : null}

        <section aria-label="Main workspace" className="min-w-0 bg-background p-4" role="main">
          <h1 className="text-sm font-medium">Workspace</h1>
        </section>

        {isRightPanelOpen ? (
          <ResizeHandle
            label="Resize right panel"
            value={rightPanelWidth}
            onPointerDown={(event) => startResize('right', event)}
            onKeyDown={(event) => resizeWithKeyboard('right', event)}
          />
        ) : null}

        {isRightPanelOpen ? (
          <aside aria-label="Right panel" className="min-w-0 border-l border-border bg-card p-4">
            <h2 className="text-sm font-medium">Right panel</h2>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

type ResizeHandleProps = {
  label: string
  value: number
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

function ResizeHandle({ label, value, onPointerDown, onKeyDown }: ResizeHandleProps): React.JSX.Element {
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={PANEL_MAX_WIDTH}
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuenow={value}
      className="titlebar-control cursor-col-resize bg-border/60 transition-colors hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
      role="separator"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  )
}
