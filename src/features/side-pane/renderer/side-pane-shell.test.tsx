import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

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
