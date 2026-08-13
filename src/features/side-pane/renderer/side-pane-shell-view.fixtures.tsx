import { Browser, FileCode, GitDiff, TerminalWindow } from '@phosphor-icons/react'

import type { SidePaneCategoryDescriptor } from './side-pane-shell'
import type { SidePaneShellViewProps } from './side-pane-shell-view'
import type { SidePaneTab } from './side-pane-store'

const noOp = (): void => undefined

export const sidePaneStoryCategories: readonly SidePaneCategoryDescriptor[] = [
  { id: 'files', label: 'Files', available: true, icon: FileCode },
  { id: 'git', label: 'Git Diff', available: true, icon: GitDiff },
  { id: 'browser', label: 'Browser', available: true, icon: Browser },
  { id: 'terminal', label: 'Terminal', available: true, icon: TerminalWindow }
]

const filesTab: SidePaneTab = {
  id: 'files:src-app',
  categoryId: 'files',
  resourceId: 'src/renderer/src/app.tsx',
  label: 'app.tsx'
}

const browserTab: SidePaneTab = {
  id: 'browser:docs',
  categoryId: 'browser',
  resourceId: 'browser-page-docs',
  title: 'Space Zero Docs'
}

const terminalTab: SidePaneTab = {
  id: 'terminal:dev',
  categoryId: 'terminal',
  resourceId: 'terminal-dev',
  label: 'pnpm dev'
}

const gitTab: SidePaneTab = {
  id: 'git:working-tree',
  categoryId: 'git',
  label: 'Working Changes'
}

const dirtyTab: SidePaneTab = {
  ...filesTab,
  id: 'files:dirty-settings',
  resourceId: 'src/features/settings/settings-screen.tsx',
  label: 'settings-screen.tsx',
  dirty: true
}

const previewTab: SidePaneTab = {
  ...filesTab,
  id: 'files:preview-readme',
  resourceId: 'README.md',
  label: 'README.md',
  preview: true
}

const manyTabs = [filesTab, dirtyTab, previewTab, browserTab, terminalTab, gitTab]

function workspaceContent(): React.JSX.Element {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center bg-muted/20 p-8">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium">Project Session</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The primary workspace remains visible beside the contextual Side Pane.
        </p>
      </div>
    </main>
  )
}

function activeContent(tab: SidePaneTab | undefined): React.JSX.Element | null {
  if (!tab) return null

  const content = {
    files: ['Files', 'Explorer and editor chrome'],
    git: ['Git Diff', 'Review working tree changes'],
    browser: ['Browser', 'https://spacezero.dev/docs'],
    terminal: ['Terminal', '$ pnpm dev']
  }[tab.categoryId]

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">{content[0]}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{content[1]}</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
        Pure visual fixture — no tool runtime connected
      </div>
    </div>
  )
}

function fixture({
  activeTabId,
  isOpen = true,
  tabs,
  width = 560
}: {
  activeTabId: string | null
  isOpen?: boolean
  tabs: SidePaneTab[]
  width?: number
}): SidePaneShellViewProps {
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const categoryMru = Object.fromEntries(tabs.map((tab) => [tab.categoryId, tab.id]))

  return {
    activeContent: activeContent(activeTab),
    activeTabId,
    canOpen: true,
    categories: sidePaneStoryCategories,
    categoryMru,
    children: workspaceContent(),
    contextKey: 'session:side-pane-story',
    isOpen,
    maxWidth: 820,
    minWidth: 320,
    renderedWidth: width,
    tabs,
    onActivateTab: noOp,
    onCloseTab: noOp,
    onCreateCategory: noOp,
    onOpenCategory: noOp,
    onReorderTab: noOp
  }
}

export const collapsedLauncherFixture = fixture({ activeTabId: null, isOpen: false, tabs: [] })

export const oneTabFixture = fixture({ activeTabId: filesTab.id, tabs: [filesTab] })

export const manyTabsFixture = fixture({ activeTabId: browserTab.id, tabs: manyTabs })

export const filesActiveFixture = fixture({ activeTabId: filesTab.id, tabs: manyTabs })

export const browserActiveFixture = fixture({ activeTabId: browserTab.id, tabs: manyTabs })

export const terminalActiveFixture = fixture({ activeTabId: terminalTab.id, tabs: manyTabs })

export const gitDiffActiveFixture = fixture({ activeTabId: gitTab.id, tabs: manyTabs })

export const narrowPaneFixture = fixture({ activeTabId: filesTab.id, tabs: manyTabs, width: 320 })

export const widePaneFixture = fixture({ activeTabId: browserTab.id, tabs: manyTabs, width: 760 })

export const dirtyTabFixture = fixture({ activeTabId: dirtyTab.id, tabs: [filesTab, dirtyTab] })

export const previewTabFixture = fixture({
  activeTabId: previewTab.id,
  tabs: [filesTab, previewTab]
})

export const activeTabFixture = fixture({ activeTabId: terminalTab.id, tabs: manyTabs })
