import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetSidePaneStore, useSidePaneStore } from './side-pane-store'
import {
  SidePaneHeaderControls,
  SidePaneShell,
  type SidePaneCategoryDescriptor,
  type SidePaneConfiguration
} from './side-pane-shell'

const categories: readonly SidePaneCategoryDescriptor[] = [
  {
    id: 'files',
    label: 'Files',
    available: true,
    icon: () => null,
    render: ({ contextKey }) => <div>Files for {contextKey}</div>
  },
  {
    id: 'git',
    label: 'Git Diff',
    available: true,
    icon: () => null,
    render: () => <div>Git changes</div>
  },
  {
    id: 'browser',
    label: 'Browser',
    available: true,
    icon: () => null,
    render: () => <div>Browser page</div>
  },
  {
    id: 'terminal',
    label: 'Terminal',
    available: true,
    icon: () => null,
    render: () => <div>Terminal session</div>
  }
]

const configuration: SidePaneConfiguration = {
  contextKey: 'session:session-1',
  capabilities: { kind: 'project-session', projectId: 'project-1', sessionId: 'session-1' },
  defaultCategoryId: 'files',
  categories
}

describe('SidePaneShell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
  })

  it('expands the collapsed launcher into the first category tab', async () => {
    const user = userEvent.setup()

    render(
      <SidePaneShell {...configuration}>
        <div>Chat</div>
      </SidePaneShell>
    )

    expect(screen.getByRole('toolbar', { name: 'Side Pane launcher' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Side Pane' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Files' }))

    expect(screen.queryByRole('toolbar', { name: 'Side Pane launcher' })).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Side Pane' })).toHaveTextContent(
      'Files for session:session-1'
    )
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Create Side Pane Tab' })).toBeInTheDocument()
  })

  it('creates the configured initial tab for an opt-in open context', () => {
    render(
      <SidePaneShell {...configuration} defaultOpen>
        <div>Chat</div>
      </SidePaneShell>
    )

    expect(screen.getByRole('complementary', { name: 'Side Pane' })).toHaveTextContent(
      'Files for session:session-1'
    )
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]?.tabs).toEqual([
      { id: 'files:1', categoryId: 'files' }
    ])
  })

  it('restores a persisted-empty Knowledge Base with its initial Files tab once per mount', async () => {
    window.localStorage.setItem(
      'spacezero.sidePane',
      JSON.stringify({
        state: {
          contexts: {
            'knowledge-base': {
              isOpen: false,
              width: 640,
              activeTabId: null,
              tabs: [],
              categoryMru: {}
            }
          }
        },
        version: 1
      })
    )
    await useSidePaneStore.persist.rehydrate()
    const user = userEvent.setup()

    render(
      <SidePaneShell
        {...configuration}
        capabilities={{ kind: 'knowledge-base' }}
        contextKey="knowledge-base"
        defaultOpen
      >
        <div>Knowledge Base Chat</div>
      </SidePaneShell>
    )

    expect(screen.getByRole('complementary', { name: 'Side Pane' })).toHaveTextContent(
      'Files for knowledge-base'
    )
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
    expect(useSidePaneStore.getState().contexts['knowledge-base']).toMatchObject({
      isOpen: true,
      width: 640,
      activeTabId: 'files:1',
      tabs: [{ id: 'files:1', categoryId: 'files' }]
    })

    await user.click(screen.getByRole('button', { name: 'Close Files' }))

    expect(screen.queryByRole('complementary', { name: 'Side Pane' })).not.toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Side Pane launcher' })).toBeInTheDocument()
    expect(useSidePaneStore.getState().contexts['knowledge-base']).toMatchObject({
      isOpen: false,
      activeTabId: null,
      tabs: []
    })
  })

  it('keeps saved Knowledge Base tabs collapsed instead of applying the fresh-context default', () => {
    useSidePaneStore.setState({
      contexts: {
        'knowledge-base': {
          isOpen: false,
          width: 590,
          activeTabId: 'files:1',
          tabs: [{ id: 'files:1', categoryId: 'files' }],
          categoryMru: { files: 'files:1' }
        }
      }
    })

    render(
      <SidePaneShell
        {...configuration}
        capabilities={{ kind: 'knowledge-base' }}
        contextKey="knowledge-base"
        defaultOpen
      >
        <div>Knowledge Base Chat</div>
      </SidePaneShell>
    )

    expect(screen.getByRole('toolbar', { name: 'Side Pane launcher' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Side Pane' })).not.toBeInTheDocument()
    expect(useSidePaneStore.getState().contexts['knowledge-base']).toMatchObject({
      isOpen: false,
      width: 590,
      activeTabId: 'files:1',
      tabs: [{ id: 'files:1', categoryId: 'files' }]
    })
  })

  it('falls back to an available category when restored state targets an unavailable category', () => {
    useSidePaneStore.setState({
      contexts: {
        'global-chat': {
          isOpen: true,
          width: 620,
          activeTabId: 'files:1',
          tabs: [{ id: 'files:1', categoryId: 'files' }],
          categoryMru: { files: 'files:1' }
        }
      }
    })
    const globalChatCategories = categories.filter(
      (category) => category.id === 'browser' || category.id === 'terminal'
    )

    render(
      <SidePaneShell
        categories={globalChatCategories}
        capabilities={{ kind: 'global-chat' }}
        contextKey="global-chat"
        defaultCategoryId="browser"
      >
        <div>Global Chat</div>
      </SidePaneShell>
    )

    expect(screen.getByRole('complementary', { name: 'Side Pane' })).toHaveTextContent(
      'Browser page'
    )
    expect(screen.getByRole('tab', { name: 'Browser' })).toHaveAttribute('aria-selected', 'true')
    expect(useSidePaneStore.getState().contexts['global-chat']).toEqual({
      isOpen: true,
      width: 620,
      activeTabId: 'browser:1',
      tabs: [{ id: 'browser:1', categoryId: 'browser' }],
      categoryMru: { browser: 'browser:1' }
    })
  })

  it('does not let a resource event for an inactive context mutate the visible context', () => {
    useSidePaneStore.getState().openCategory('project:project-1', 'browser')
    useSidePaneStore.getState().setWidth('project:project-1', 610)
    useSidePaneStore.getState().openCategory('session:session-2', 'terminal')
    useSidePaneStore.getState().setWidth('session:session-2', 520)
    const sessionTwoConfiguration: SidePaneConfiguration = {
      ...configuration,
      contextKey: 'session:session-2',
      capabilities: {
        kind: 'project-session',
        projectId: 'project-1',
        sessionId: 'session-2'
      }
    }
    const firstContextConfiguration: SidePaneConfiguration = {
      ...configuration,
      contextKey: 'project:project-1',
      capabilities: { kind: 'project-home', projectId: 'project-1' }
    }
    const { rerender } = render(
      <SidePaneShell {...firstContextConfiguration}>
        <div>Project Home</div>
      </SidePaneShell>
    )
    expect(screen.getByText('Browser page')).toBeInTheDocument()

    rerender(
      <SidePaneShell {...sessionTwoConfiguration}>
        <div>Second Session</div>
      </SidePaneShell>
    )
    const visibleContextState = structuredClone(
      useSidePaneStore.getState().contexts['session:session-2']
    )

    act(() => {
      useSidePaneStore.getState().openCategory('project:project-1', 'git')
    })

    expect(screen.getByText('Terminal session')).toBeInTheDocument()
    expect(screen.queryByText('Git changes')).not.toBeInTheDocument()
    expect(useSidePaneStore.getState().contexts['session:session-2']).toEqual(visibleContextState)
  })

  it('uses the expanded plus menu to create and focus category tabs', async () => {
    const user = userEvent.setup()
    render(
      <SidePaneShell {...configuration}>
        <div>Chat</div>
      </SidePaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Side Pane Tab' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Terminal' }))

    expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Terminal session')).toBeInTheDocument()
  })

  it('renders Browser page metadata directly in the peer Side Pane tab strip', () => {
    useSidePaneStore.getState().syncCategoryTabs(
      configuration.contextKey,
      'browser',
      [
        {
          id: 'browser-tab-1',
          categoryId: 'browser',
          title: 'Space Zero Docs',
          faviconUrl: 'data:image/png;base64,aWNvbg=='
        }
      ],
      'browser-tab-1',
      true
    )

    render(
      <SidePaneShell {...configuration}>
        <div>Chat</div>
      </SidePaneShell>
    )

    const tab = screen.getByRole('tab', { name: 'Space Zero Docs' })
    expect(tab.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,aWNvbg==')
    expect(screen.queryByRole('tablist', { name: 'Browser tabs' })).not.toBeInTheDocument()
  })

  it('uses a category creation capability for explicit plus-menu Browser pages', async () => {
    const createBrowserPage = vi.fn()
    const creationCategories = categories.map((category) =>
      category.id === 'browser' ? { ...category, create: createBrowserPage } : category
    )
    const user = userEvent.setup()
    render(
      <SidePaneShell {...configuration} categories={creationCategories}>
        <div>Chat</div>
      </SidePaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Side Pane Tab' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Browser' }))

    expect(createBrowserPage).toHaveBeenCalledTimes(1)
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]?.tabs).toEqual([
      { id: 'files:1', categoryId: 'files' }
    ])
  })

  it('keeps category tabs as ordered peers and focuses an existing Git Diff singleton', async () => {
    const user = userEvent.setup()
    render(
      <SidePaneShell {...configuration}>
        <div>Chat</div>
      </SidePaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))
    act(() => {
      useSidePaneStore.getState().openCategory(configuration.contextKey, 'browser')
      useSidePaneStore.getState().openCategory(configuration.contextKey, 'git')
      useSidePaneStore.getState().openCategory(configuration.contextKey, 'git')
    })

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Files',
      'Browser',
      'Git Diff'
    ])
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]?.tabs).toHaveLength(3)
    expect(screen.getByText('Git changes')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Files' }))

    expect(screen.getByText('Files for session:session-1')).toBeInTheDocument()
  })

  it('activates and reorders tabs from the keyboard', async () => {
    const user = userEvent.setup()
    render(
      <SidePaneShell {...configuration}>
        <div>Chat</div>
      </SidePaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))
    act(() => {
      useSidePaneStore.getState().openCategory(configuration.contextKey, 'browser')
      useSidePaneStore.getState().openCategory(configuration.contextKey, 'git')
    })

    const gitTab = screen.getByRole('tab', { name: 'Git Diff' })
    fireEvent.keyDown(gitTab, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Browser' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Browser' }), {
      altKey: true,
      key: 'ArrowLeft',
      shiftKey: true
    })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Browser',
      'Files',
      'Git Diff'
    ])
  })

  it('shows expanded tabs in the shared header while keeping only content in the pane', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SidePaneHeaderControls configuration={configuration} />
        <SidePaneShell {...configuration} showInlineHeaderTabs={false}>
          <div>Chat</div>
        </SidePaneShell>
      </>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))

    const header = screen.getByLabelText('Side Pane header controls')
    expect(header).toContainElement(screen.getByRole('tablist'))
    expect(header).toContainElement(screen.getByRole('button', { name: 'Toggle Side Pane' }))
    expect(screen.getByRole('complementary', { name: 'Side Pane' })).not.toContainElement(
      screen.getByRole('tablist')
    )
  })

  it('retains the sixty-percent default and accessible Side Pane resize constraints', async () => {
    const user = userEvent.setup()
    render(
      <SidePaneShell {...configuration}>
        <div>Chat</div>
      </SidePaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))
    const pane = screen.getByRole('complementary', { name: 'Side Pane' })
    const resizeHandle = screen.getByRole('separator', { name: 'Resize Side Pane' })

    expect(pane).toHaveStyle({ width: '614px' })
    expect(resizeHandle).toHaveAttribute('aria-valuemin', '400')
    expect(resizeHandle).toHaveAttribute('aria-valuemax', '660')

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' })
    expect(pane).toHaveStyle({ width: '638px' })
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]?.width).toBe(638)
  })

  it('closes the final tab and returns to the category launcher', async () => {
    const user = userEvent.setup()
    render(
      <SidePaneShell {...configuration}>
        <div>Chat</div>
      </SidePaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))
    await user.click(screen.getByRole('button', { name: 'Close Files' }))

    expect(screen.queryByRole('complementary', { name: 'Side Pane' })).not.toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Side Pane launcher' })).toBeInTheDocument()
    expect(useSidePaneStore.getState().contexts[configuration.contextKey]).toMatchObject({
      isOpen: false,
      activeTabId: null,
      tabs: []
    })
  })
})
