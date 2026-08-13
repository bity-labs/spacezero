import { createElement } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGlobalChatSidePaneConfiguration,
  createKnowledgeBaseSidePaneConfiguration,
  createProjectHomeSidePaneConfiguration,
  createProjectSessionSidePaneConfiguration
} from './side-pane-configurations'
import { SidePaneShell } from './side-pane-shell'
import { resetSidePaneStore, useSidePaneStore } from './side-pane-store'

describe('Side Pane contextual configurations', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
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
