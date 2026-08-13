import { createElement } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandProvider } from '../../app-commands/renderer/app-command-context'
import { KeyboardShortcutsProvider } from '../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import {
  createGlobalChatSidePaneConfiguration,
  createKnowledgeBaseSidePaneConfiguration,
  createProjectHomeSidePaneConfiguration,
  createProjectSessionSidePaneConfiguration
} from './side-pane-configurations'
import { SidePaneShell } from './side-pane-shell'
import { resetSidePaneStore, useSidePaneStore } from './side-pane-store'
import { clearTerminalSidePaneCreateError } from './terminal-side-pane'

describe('Side Pane contextual configurations', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
    clearTerminalSidePaneCreateError('global-chat')
    clearTerminalSidePaneCreateError('project:project-1')
  })
  it('targets the ordered stable category sets and context-owned defaults', () => {
    const projectHome = createProjectHomeSidePaneConfiguration({ id: 'project-1' })
    const project = createProjectSessionSidePaneConfiguration({
      id: 'project-session-1',
      projectId: 'project-1'
    })
    const globalChat = createGlobalChatSidePaneConfiguration()
    const knowledgeBase = createKnowledgeBaseSidePaneConfiguration()

    expect(projectHome).toMatchObject({
      contextKey: 'project:project-1',
      defaultCategoryId: 'files',
      capabilities: { kind: 'project-home', projectId: 'project-1' }
    })
    expect(projectHome.categories.map((category) => category.id)).toEqual([
      'files',
      'git',
      'browser',
      'terminal'
    ])
    expect(projectHome.categories.every((category) => category.available && category.render)).toBe(
      true
    )

    expect(project).toMatchObject({
      contextKey: 'session:project-session-1',
      defaultCategoryId: 'files',
      capabilities: {
        kind: 'project-session',
        projectId: 'project-1',
        sessionId: 'project-session-1'
      }
    })
    expect(project.categories.map((category) => category.id)).toEqual([
      'files',
      'git',
      'browser',
      'terminal'
    ])
    expect(project.categories[0]).toMatchObject({ id: 'files', available: true })
    expect(project.categories[0]?.render).toBeTypeOf('function')
    expect(project.categories[1]).toMatchObject({ id: 'git', available: true })
    expect(project.categories[1]?.render).toBeTypeOf('function')
    expect(project.categories[2]).toMatchObject({ id: 'browser', available: true })
    expect(project.categories[2]?.render).toBeTypeOf('function')
    expect(project.categories[3]).toMatchObject({ id: 'terminal', available: true })
    expect(project.categories[3]?.render).toBeTypeOf('function')

    expect(globalChat).toMatchObject({
      contextKey: 'global-chat',
      defaultCategoryId: 'browser',
      capabilities: { kind: 'global-chat' }
    })
    expect(globalChat.categories.map((category) => category.id)).toEqual(['browser', 'terminal'])
    expect(
      globalChat.categories.some((category) => category.id === 'files' || category.id === 'git')
    ).toBe(false)

    expect(knowledgeBase).toMatchObject({
      contextKey: 'knowledge-base',
      defaultCategoryId: 'files',
      defaultOpen: true,
      capabilities: { kind: 'knowledge-base' }
    })
    expect(knowledgeBase.categories.map((category) => category.id)).toEqual([
      'files',
      'git',
      'browser',
      'terminal'
    ])
    expect(knowledgeBase.categories[0]).toMatchObject({ id: 'files', available: true })
    expect(knowledgeBase.categories[0]?.render).toBeTypeOf('function')
    expect(knowledgeBase.categories[1]).toMatchObject({ id: 'git', available: true })
    expect(knowledgeBase.categories[1]?.render).toBeTypeOf('function')
    expect(knowledgeBase.categories[2]).toMatchObject({ id: 'browser', available: true })
    expect(knowledgeBase.categories[2]?.render).toBeTypeOf('function')
    expect(knowledgeBase.categories[3]).toMatchObject({ id: 'terminal', available: true })
    expect(knowledgeBase.categories[3]?.render).toBeTypeOf('function')
  })

  it('waits for the Browser launcher capability and keeps rejected requests resource-free', async () => {
    let rejectStateRequest: ((reason?: unknown) => void) | undefined
    const getState = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectStateRequest = reject
        })
    )
    window.spacezero.browser.getState = getState
    const configuration = createGlobalChatSidePaneConfiguration()
    const user = userEvent.setup()

    render(
      createElement(SidePaneShell, {
        ...configuration,
        children: createElement('div', null, 'Global Chat')
      })
    )

    await user.click(screen.getByRole('button', { name: 'Browser' }))

    expect(getState).toHaveBeenCalledWith({
      contextKey: 'global-chat',
      context: { kind: 'global-chat' }
    })
    expect(screen.queryByRole('complementary', { name: 'Side Pane' })).not.toBeInTheDocument()
    expect(useSidePaneStore.getState().contexts['global-chat']).toBeUndefined()
    expect(window.localStorage.getItem('spacezero.sidePane') ?? '').not.toContain('browser:1')

    await act(async () => rejectStateRequest?.(new Error('Browser unavailable')))
    await waitFor(() =>
      expect(screen.getByRole('toolbar', { name: 'Side Pane launcher' })).toBeInTheDocument()
    )

    expect(useSidePaneStore.getState().contexts['global-chat']).toBeUndefined()
    expect(window.localStorage.getItem('spacezero.sidePane') ?? '').not.toContain('browser:1')
  })

  it('shows a resource-free launcher failure and retries into exactly one PTY-backed tab', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('Terminal unavailable'))
      .mockResolvedValueOnce({
        status: 'running' as const,
        terminalId: 'pty-retried',
        tabs: [{ terminalId: 'pty-retried', restorationId: 'saved-retried', title: 'Shell' }],
        activeTerminalId: 'pty-retried'
      })
    window.spacezero.terminal.create = create
    const configuration = createGlobalChatSidePaneConfiguration()
    const user = userEvent.setup()

    render(
      createElement(SidePaneShell, {
        ...configuration,
        children: createElement('div', null, 'Global Chat')
      })
    )

    await user.click(screen.getByRole('button', { name: 'Terminal' }))

    expect(await screen.findByText('Terminal failed to start')).toBeInTheDocument()
    expect(screen.getByText('Terminal unavailable')).toBeInTheDocument()
    const failedTab = useSidePaneStore.getState().contexts['global-chat']?.tabs[0]
    expect(failedTab).toMatchObject({ categoryId: 'terminal' })
    expect(failedTab?.resourceId).toBeUndefined()
    expect(window.localStorage.getItem('spacezero.sidePane') ?? '').not.toContain(
      'terminal:create-error'
    )

    await user.click(screen.getByRole('button', { name: 'Retry Terminal' }))

    await waitFor(() =>
      expect(useSidePaneStore.getState().contexts['global-chat']).toMatchObject({
        activeTabId: 'terminal:saved-retried',
        tabs: [
          {
            id: 'terminal:saved-retried',
            categoryId: 'terminal',
            resourceId: 'pty-retried'
          }
        ]
      })
    )
    expect(create).toHaveBeenNthCalledWith(1, {
      context: { kind: 'global-chat' },
      forceNew: false
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      context: { kind: 'global-chat' },
      forceNew: false
    })
  })

  it('shows a resource-free explicit-create failure and retries with force-new', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('Shell executable is unavailable'))
      .mockResolvedValueOnce({
        status: 'running' as const,
        terminalId: 'pty-explicit',
        tabs: [{ terminalId: 'pty-explicit', restorationId: 'saved-explicit', title: 'Shell' }],
        activeTerminalId: 'pty-explicit'
      })
    window.spacezero.terminal.create = create
    const configuration = createProjectHomeSidePaneConfiguration({ id: 'project-1' })
    useSidePaneStore.getState().openCategory(configuration.contextKey, 'files')
    const user = userEvent.setup()

    render(
      createElement(
        AppCommandProvider,
        null,
        createElement(
          KeyboardShortcutsProvider,
          null,
          createElement(SidePaneShell, {
            ...configuration,
            children: createElement('div', null, 'Project Home')
          })
        )
      )
    )

    await user.click(screen.getByRole('button', { name: 'Create Side Pane Tab' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Terminal' }))

    expect(await screen.findByText('Terminal failed to start')).toBeInTheDocument()
    expect(screen.getByText('Shell executable is unavailable')).toBeInTheDocument()
    expect(
      useSidePaneStore
        .getState()
        .contexts[configuration.contextKey]?.tabs.find((tab) => tab.categoryId === 'terminal')
        ?.resourceId
    ).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Retry Terminal' }))

    await waitFor(() =>
      expect(
        useSidePaneStore
          .getState()
          .contexts[configuration.contextKey]?.tabs.filter(
            (tab) => tab.categoryId === 'terminal' && tab.resourceId
          )
      ).toEqual([
        expect.objectContaining({
          id: 'terminal:saved-explicit',
          resourceId: 'pty-explicit'
        })
      ])
    )
    expect(create).toHaveBeenNthCalledWith(1, {
      context: { kind: 'project-home', projectId: 'project-1' },
      forceNew: true
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      context: { kind: 'project-home', projectId: 'project-1' },
      forceNew: true
    })
  })

  it('preserves persisted Terminal placeholders through restore rejection, remount, and retry', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('Terminal unavailable'))
      .mockResolvedValueOnce({
        status: 'running' as const,
        terminalId: 'pty-b',
        tabs: [
          { terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' },
          { terminalId: 'pty-b', restorationId: 'saved-b', title: 'web' }
        ],
        activeTerminalId: 'pty-b'
      })
    window.spacezero.terminal.create = create
    const persistedLayout = {
      isOpen: true,
      width: 540,
      activeTabId: 'terminal:saved-b',
      tabs: [
        { id: 'terminal:saved-a', categoryId: 'terminal' as const, title: 'api' },
        {
          id: 'browser:docs',
          categoryId: 'browser' as const,
          resourceId: 'browser:docs',
          title: 'Docs'
        },
        { id: 'terminal:saved-b', categoryId: 'terminal' as const, title: 'web' }
      ],
      categoryMru: { browser: 'browser:docs', terminal: 'terminal:saved-b' }
    }
    useSidePaneStore.setState({ contexts: { 'global-chat': persistedLayout } })
    const configuration = createGlobalChatSidePaneConfiguration()
    const shell = () =>
      createElement(
        AppCommandProvider,
        null,
        createElement(
          KeyboardShortcutsProvider,
          null,
          createElement(SidePaneShell, {
            ...configuration,
            children: createElement('div', null, 'Global Chat')
          })
        )
      )

    const firstMount = render(shell())

    expect(await screen.findByText('Terminal failed to restore')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry Terminal' })).toBeEnabled()
    expect(useSidePaneStore.getState().contexts['global-chat']).toEqual(persistedLayout)
    expect(
      JSON.parse(window.localStorage.getItem('spacezero.sidePane') ?? '{}').state.contexts[
        'global-chat'
      ]
    ).toEqual(persistedLayout)

    firstMount.unmount()
    render(shell())

    expect(screen.getByText('Terminal failed to restore')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry Terminal' })).toBeEnabled()
    expect(create).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Retry Terminal' }))

    await waitFor(() =>
      expect(useSidePaneStore.getState().contexts['global-chat']).toEqual({
        ...persistedLayout,
        tabs: [
          {
            id: 'terminal:saved-a',
            categoryId: 'terminal',
            resourceId: 'pty-a',
            title: 'api'
          },
          persistedLayout.tabs[1],
          {
            id: 'terminal:saved-b',
            categoryId: 'terminal',
            resourceId: 'pty-b',
            title: 'web'
          }
        ]
      })
    )
    expect(create).toHaveBeenNthCalledWith(1, {
      context: { kind: 'global-chat' },
      forceNew: false
    })
    expect(create).toHaveBeenNthCalledWith(2, {
      context: { kind: 'global-chat' },
      forceNew: false
    })
  })

  it('does not fall back to a synthetic Browser resource when explicit creation is rejected', async () => {
    const createTab = vi.fn(async () => {
      throw new Error('Browser unavailable')
    })
    window.spacezero.browser.createTab = createTab
    const browserCategory = createGlobalChatSidePaneConfiguration().categories.find(
      (category) => category.id === 'browser'
    )

    browserCategory?.create?.()

    await waitFor(() => expect(createTab).toHaveBeenCalledTimes(1))
    expect(useSidePaneStore.getState().contexts['global-chat']).toBeUndefined()
    expect(window.localStorage.getItem('spacezero.sidePane') ?? '').not.toContain('browser:1')
  })
})
