import { useCallback, useMemo, type KeyboardEvent, type PointerEvent } from 'react'
import {
  CalendarBlank,
  DotsSixVertical,
  FolderPlus,
  FunnelSimple,
  MagnifyingGlass,
  Moon,
  PaperPlaneTilt,
  Sidebar,
  SquaresFour,
  Sun
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { useRegisterAppCommands } from '../../features/app-commands/renderer/app-command-context'
import type { AppCommand } from '../../features/app-commands/renderer/app-command.model'
import { useCommandPaletteController } from '../../features/command-palette/renderer/command-palette-controller'
import type { KeyboardShortcutDefinition } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-manager'
import { useRegisterKeyboardShortcuts } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import { AccountMenu } from './components/app-shell/account-menu'
import { AppSidebar } from './components/sidebar/app-sidebar'
import {
  SIDEBAR_KEYBOARD_RESIZE_STEP,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth
} from './components/sidebar/sidebar-layout'
import { SidebarNavItem } from './components/sidebar/sidebar-nav-item'
import { SidebarSectionHeader } from './components/sidebar/sidebar-section-header'
import { Button } from './components/ui/button'
import { SidebarGroup, SidebarMenu } from './components/ui/sidebar'
import { useColorMode } from './color-mode-provider'
import { cn } from './lib/utils'
import { useUiLayoutStore } from './stores/ui-layout-store'

const workspaceShortcuts: readonly KeyboardShortcutDefinition[] = [
  { commandId: 'workspace.toggle-left-panel', defaultKeybinding: { normalized: 'mod+b' } },
  { commandId: 'workspace.toggle-right-panel', defaultKeybinding: { normalized: 'mod+shift+b' } }
]

type ResizablePanel = 'left' | 'right'

export function WorkspaceShell(): React.JSX.Element {
  const isLeftPanelOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const isRightPanelOpen = useUiLayoutStore((state) => state.isRightSidebarOpen)
  const leftPanelWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const rightPanelWidth = useUiLayoutStore((state) => state.rightSidebarWidth)
  const setLeftPanelWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const setRightPanelWidth = useUiLayoutStore((state) => state.setRightSidebarWidth)
  const toggleLeftPanel = useUiLayoutStore((state) => state.toggleLeftSidebar)
  const toggleRightPanel = useUiLayoutStore((state) => state.toggleRightSidebar)
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
        handler: toggleLeftPanel
      },
      {
        id: 'workspace.toggle-right-panel',
        title: isRightPanelOpen ? t('workspace.hideRightPanel') : t('workspace.showRightPanel'),
        category: t('appCommands.categories.workspace'),
        keywords: ['sidebar', 'inspector'],
        handler: toggleRightPanel
      }
    ],
    [isLeftPanelOpen, isRightPanelOpen, t, toggleLeftPanel, toggleRightPanel]
  )

  useRegisterAppCommands(workspaceCommands)
  useRegisterKeyboardShortcuts(workspaceShortcuts)

  const resizePanel = useCallback((panel: ResizablePanel, width: number) => {
    const setWidth = panel === 'left' ? setLeftPanelWidth : setRightPanelWidth
    setWidth(clampSidebarWidth(width))
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

      if (event.key === 'Home') nextWidth = SIDEBAR_MIN_WIDTH
      if (event.key === 'End') nextWidth = SIDEBAR_MAX_WIDTH
      if (event.key === 'ArrowLeft') nextWidth = currentWidth + (panel === 'right' ? SIDEBAR_KEYBOARD_RESIZE_STEP : -SIDEBAR_KEYBOARD_RESIZE_STEP)
      if (event.key === 'ArrowRight') nextWidth = currentWidth + (panel === 'left' ? SIDEBAR_KEYBOARD_RESIZE_STEP : -SIDEBAR_KEYBOARD_RESIZE_STEP)

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

  const titlebarGridTemplateColumns = [
    isLeftPanelOpen ? `${leftPanelWidth}px` : 'minmax(0, 1fr)',
    'minmax(0, 1fr)',
    isRightPanelOpen ? `${rightPanelWidth}px` : 'minmax(0, 1fr)'
  ].join(' ')

  return (
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header className="app-titlebar grid h-12 items-stretch bg-background" style={{ gridTemplateColumns: titlebarGridTemplateColumns }}>
        <div
          className={cn(
            'flex items-center justify-start px-3',
            isLeftPanelOpen ? 'border-r border-sidebar-border bg-sidebar' : 'bg-background'
          )}
        >
          <div className="mac-traffic-light-space shrink-0" />
          <div className="titlebar-control flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={isLeftPanelOpen ? t('workspace.hideLeftPanel') : t('workspace.showLeftPanel')}
              aria-pressed={isLeftPanelOpen}
              onClick={toggleLeftPanel}
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

        <div className="titlebar-control flex items-center justify-center px-3">
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

        <div
          className={cn(
            'titlebar-control flex items-center justify-end px-3',
            isRightPanelOpen ? 'border-l border-sidebar-border bg-sidebar' : 'bg-background'
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={isRightPanelOpen ? t('workspace.hideRightPanel') : t('workspace.showRightPanel')}
            aria-pressed={isRightPanelOpen}
            onClick={toggleRightPanel}
          >
            <Sidebar className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns }}>
        {isLeftPanelOpen ? (
          <AppSidebar
            aria-label={t('workspace.leftPanel')}
            className="px-2 pt-4"
            contentClassName="px-0"
            footer={<AccountMenu settingsLabel={t('workspace.openAppSettings')} />}
          >
            <SidebarMenu className="px-2" aria-label={t('workspace.navigation')}>
              <SidebarNavItem icon={PaperPlaneTilt} label="New Agent" />
              <SidebarNavItem icon={MagnifyingGlass} label="Search" />
              <SidebarNavItem icon={CalendarBlank} label="Automations" />
              <SidebarNavItem icon={SquaresFour} label="Customize" />
            </SidebarMenu>

            <SidebarGroup className="mt-8" aria-label="Repositories">
              <SidebarSectionHeader
                label="Repositories"
                expandable
                actions={[
                  { label: 'Filter repositories', icon: FunnelSimple },
                  { label: 'Add repository', icon: FolderPlus }
                ]}
              />
            </SidebarGroup>
          </AppSidebar>
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
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
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
