import { useMemo, type KeyboardEvent, type PointerEvent } from 'react'
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
import { AgentChat, type AgentChatMessage } from './components/agent-chat'
import { AppSidebar } from './components/sidebar/app-sidebar'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './components/sidebar/sidebar-layout'
import { SidebarNavItem } from './components/sidebar/sidebar-nav-item'
import { SidebarSectionHeader } from './components/sidebar/sidebar-section-header'
import { Button } from './components/ui/button'
import { SidebarGroup, SidebarMenu } from './components/ui/sidebar'
import { Textarea } from './components/ui/textarea'
import { useColorMode } from './color-mode-provider'
import { useSidebarResize } from './hooks/use-sidebar-resize'
import { cn } from './lib/utils'
import { useUiLayoutStore } from './stores/ui-layout-store'

const workspaceShortcuts: readonly KeyboardShortcutDefinition[] = [
  { commandId: 'workspace.toggle-left-panel', defaultKeybinding: { normalized: 'mod+b' } },
  { commandId: 'workspace.toggle-right-panel', defaultKeybinding: { normalized: 'mod+shift+b' } }
]

const agentChatDebugMessages: AgentChatMessage[] = [
  {
    id: 'debug-user-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Show me the current workspace context.' }]
  },
  {
    id: 'debug-agent-thinking',
    role: 'assistant',
    status: 'streaming',
    parts: [
      {
        type: 'thinking',
        text: 'Reading workspace-shell.tsx and checking the AgentChat debug mount...',
        state: 'streaming',
        collapsed: false
      }
    ]
  },
  {
    id: 'debug-agent-complete',
    role: 'assistant',
    status: 'complete',
    parts: [
      {
        type: 'thinking',
        text: 'Inspected the workspace shell and verified AgentChat is mounted in the main workspace for debugging.',
        state: 'complete',
        collapsed: false
      },
      {
        type: 'text',
        text: 'This is the AgentChat debug surface. Use this area to validate layout, scrolling, message styling, and reasoning blocks in the main workspace.'
      }
    ]
  }
]

export function WorkspaceShell(): React.JSX.Element {
  const isLeftPanelOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const isRightPanelOpen = useUiLayoutStore((state) => state.isRightSidebarOpen)
  const leftPanelWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const rightPanelWidth = useUiLayoutStore((state) => state.rightSidebarWidth)
  const setLeftPanelWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const setRightPanelWidth = useUiLayoutStore((state) => state.setRightSidebarWidth)
  const toggleLeftPanel = useUiLayoutStore((state) => state.toggleLeftSidebar)
  const toggleRightPanel = useUiLayoutStore((state) => state.toggleRightSidebar)
  const leftPanelResize = useSidebarResize({
    side: 'left',
    width: leftPanelWidth,
    setWidth: setLeftPanelWidth
  })
  const rightPanelResize = useSidebarResize({
    side: 'right',
    width: rightPanelWidth,
    setWidth: setRightPanelWidth
  })
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
      <header
        className="app-titlebar grid h-12 items-stretch bg-background"
        style={{ gridTemplateColumns: titlebarGridTemplateColumns }}
      >
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
              aria-label={
                isLeftPanelOpen ? t('workspace.hideLeftPanel') : t('workspace.showLeftPanel')
              }
              aria-pressed={isLeftPanelOpen}
              onClick={toggleLeftPanel}
            >
              <Sidebar className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={
                colorMode === 'dark'
                  ? t('workspace.switchToLightMode')
                  : t('workspace.switchToDarkMode')
              }
              onClick={() =>
                setColorMode((currentMode) => (currentMode === 'dark' ? 'light' : 'dark'))
              }
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
            aria-label={
              isRightPanelOpen ? t('workspace.hideRightPanel') : t('workspace.showRightPanel')
            }
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
            className="pt-4"
            contentClassName="px-0"
            footer={<AccountMenu settingsLabel={t('workspace.openAppSettings')} />}
          >
            <SidebarMenu className="px-2" aria-label={t('workspace.navigation')}>
              <SidebarNavItem icon={PaperPlaneTilt} label={t('workspace.sidebar.newAgent')} />
              <SidebarNavItem icon={MagnifyingGlass} label={t('workspace.sidebar.search')} />
              <SidebarNavItem icon={CalendarBlank} label={t('workspace.sidebar.automations')} />
              <SidebarNavItem icon={SquaresFour} label={t('workspace.sidebar.customize')} />
            </SidebarMenu>

            <SidebarGroup className="mt-8" aria-label={t('workspace.repositories.label')}>
              <SidebarSectionHeader
                label={t('workspace.repositories.label')}
                expandable
                actions={[
                  { label: t('workspace.repositories.filter'), icon: FunnelSimple },
                  { label: t('workspace.repositories.add'), icon: FolderPlus }
                ]}
              />
            </SidebarGroup>
          </AppSidebar>
        ) : null}

        {isLeftPanelOpen ? (
          <ResizeHandle
            label={t('workspace.resizeLeftPanel')}
            value={leftPanelWidth}
            onPointerDown={leftPanelResize.startResize}
            onKeyDown={leftPanelResize.resizeWithKeyboard}
          />
        ) : null}

        <section
          aria-label={t('workspace.mainLabel')}
          className="flex min-h-0 min-w-0 flex-col gap-4 bg-background p-4"
          role="main"
        >
          <h1 className="text-sm font-medium">{t('workspace.title')}</h1>
          <AgentChat
            messages={agentChatDebugMessages}
            className="min-h-0 rounded-lg border bg-card"
            composer={
              <form className="flex gap-2" onSubmit={(event) => event.preventDefault()}>
                <Textarea
                  aria-label="Agent prompt"
                  className="min-h-10 resize-none"
                  placeholder="Ask the agent anything..."
                  rows={1}
                />
                <Button type="submit" size="icon" aria-label="Send message">
                  <PaperPlaneTilt className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
            }
          />
        </section>

        {isRightPanelOpen ? (
          <ResizeHandle
            label={t('workspace.resizeRightPanel')}
            value={rightPanelWidth}
            onPointerDown={rightPanelResize.startResize}
            onKeyDown={rightPanelResize.resizeWithKeyboard}
          />
        ) : null}

        {isRightPanelOpen ? (
          <aside
            aria-label={t('workspace.rightPanel')}
            className="min-w-0 border-l border-sidebar-border bg-sidebar p-4 text-sidebar-foreground"
          >
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

function ResizeHandle({
  label,
  value,
  onPointerDown,
  onKeyDown
}: ResizeHandleProps): React.JSX.Element {
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
