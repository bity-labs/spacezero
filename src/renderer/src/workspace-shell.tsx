import { useCallback, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { DotsSixVertical, MagnifyingGlass, Moon, Sidebar, Sun } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { useRegisterAppCommands } from '../../features/app-commands/renderer/app-command-context'
import type { AppCommand } from '../../features/app-commands/renderer/app-command.model'
import { useCommandPaletteController } from '../../features/command-palette/renderer/command-palette-controller'
import { Button } from './components/ui/button'
import { useColorMode } from './color-mode-provider'

const LEFT_PANEL_DEFAULT_WIDTH = 280
const RIGHT_PANEL_DEFAULT_WIDTH = 320
const PANEL_MIN_WIDTH = 220
const PANEL_MAX_WIDTH = 520
const KEYBOARD_RESIZE_STEP = 24

type ResizablePanel = 'left' | 'right'

function clampPanelWidth(width: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width))
}

export function WorkspaceShell(): React.JSX.Element {
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useState(LEFT_PANEL_DEFAULT_WIDTH)
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH)
  const { colorMode, setColorMode } = useColorMode()
  const commandPalette = useCommandPaletteController()
  const { t } = useTranslation()

  const workspaceCommands = useMemo<readonly AppCommand[]>(
    () => [
      {
        id: 'workspace.toggle-left-panel',
        title: isLeftPanelOpen ? t('workspace.hideLeftPanel') : t('workspace.showLeftPanel'),
        category: t('appCommands.categories.workspace'),
        keywords: ['sidebar', 'navigation'],
        handler: () => setIsLeftPanelOpen((isOpen) => !isOpen)
      },
      {
        id: 'workspace.toggle-right-panel',
        title: isRightPanelOpen ? t('workspace.hideRightPanel') : t('workspace.showRightPanel'),
        category: t('appCommands.categories.workspace'),
        keywords: ['sidebar', 'inspector'],
        handler: () => setIsRightPanelOpen((isOpen) => !isOpen)
      }
    ],
    [isLeftPanelOpen, isRightPanelOpen, t]
  )

  useRegisterAppCommands(workspaceCommands)

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
          <div className="titlebar-control flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={isLeftPanelOpen ? t('workspace.hideLeftPanel') : t('workspace.showLeftPanel')}
              aria-pressed={isLeftPanelOpen}
              onClick={() => setIsLeftPanelOpen((isOpen) => !isOpen)}
            >
              <Sidebar className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={colorMode === 'dark' ? t('workspace.switchToLightMode') : t('workspace.switchToDarkMode')}
              onClick={() => setColorMode((currentMode) => (currentMode === 'dark' ? 'light' : 'dark'))}
            >
              {colorMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="titlebar-control flex items-center justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground"
            aria-label={t('app.openCommandPalette')}
            onClick={() => commandPalette.open()}
          >
            <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
            {t('app.name')}
          </Button>
        </div>

        <div className="titlebar-control flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={isRightPanelOpen ? t('workspace.hideRightPanel') : t('workspace.showRightPanel')}
            aria-pressed={isRightPanelOpen}
            onClick={() => setIsRightPanelOpen((isOpen) => !isOpen)}
          >
            <Sidebar className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns }}>
        {isLeftPanelOpen ? (
          <aside aria-label={t('workspace.leftPanel')} className="min-w-0 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
            <h2 className="text-sm font-medium">{t('workspace.leftPanel')}</h2>
            <nav className="mt-4 flex flex-col gap-1" aria-label={t('workspace.navigation')}>
              <Link className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" to="/settings">
                {t('workspace.settingsLink')}
              </Link>
            </nav>
          </aside>
        ) : null}

        {isLeftPanelOpen ? (
          <ResizeHandle
            label={t('workspace.resizeLeftPanel')}
            value={leftPanelWidth}
            onPointerDown={(event) => startResize('left', event)}
            onKeyDown={(event) => resizeWithKeyboard('left', event)}
          />
        ) : null}

        <section aria-label={t('workspace.mainLabel')} className="min-w-0 bg-background p-4" role="main">
          <h1 className="text-sm font-medium">{t('workspace.title')}</h1>
        </section>

        {isRightPanelOpen ? (
          <ResizeHandle
            label={t('workspace.resizeRightPanel')}
            value={rightPanelWidth}
            onPointerDown={(event) => startResize('right', event)}
            onKeyDown={(event) => resizeWithKeyboard('right', event)}
          />
        ) : null}

        {isRightPanelOpen ? (
          <aside aria-label={t('workspace.rightPanel')} className="min-w-0 border-l border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
            <h2 className="text-sm font-medium">{t('workspace.rightPanel')}</h2>
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
      className="titlebar-control flex cursor-col-resize items-center justify-center text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      role="separator"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      <DotsSixVertical className="h-4 w-3" aria-hidden="true" />
    </div>
  )
}
