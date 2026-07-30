import { describe, expect, it, vi } from 'vitest'

import type { GlobalChatContext } from '../shared'

describe('Global Chat IPC', () => {
  it('returns the persisted current Global Chat Context through the Sessions boundary', async () => {
    vi.resetModules()
    const handlers = new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>()
    const context: GlobalChatContext = {
      id: 'global-chat-context-1',
      workspaceContext: { kind: 'global-chat', key: 'global-chat' },
      agentSession: {
        id: 'global-chat-agent-session-1',
        kind: 'workspace',
        title: 'Chat',
        status: 'idle',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }
    const history = [
      {
        id: 'global-chat-context-retained',
        initialPrompt: 'Inspect the workspace',
        createdAt: new Date(0).toISOString()
      }
    ]
    const getOrCreateCurrentChatContext = vi.fn(async () => context)
    const listChatHistory = vi.fn(async () => history)
    const resumeChatContext = vi.fn(async () => context)
    const clearChat = vi.fn(async () => context)

    vi.doMock('electron', () => ({
      ipcMain: {
        handle: vi.fn(
          (channel: string, handler: (event: unknown, input?: unknown) => Promise<unknown>) => {
            handlers.set(channel, handler)
          }
        )
      }
    }))
    vi.doMock('./sessions.repository', () => ({
      createSessionsRepository: () => ({})
    }))
    vi.doMock('./global-chat.runtime', () => ({
      getGlobalChatService: () => ({
        getOrCreateCurrentChatContext,
        listChatHistory,
        resumeChatContext,
        clearChat
      })
    }))
    vi.doMock('./project-session-chat.runtime', () => ({
      getProjectSessionChatService: vi.fn()
    }))
    vi.doMock('./session-cleanup.runtime', () => ({ getSessionCleanupService: vi.fn() }))
    vi.doMock('./managed-worktree.runtime', () => ({ getManagedWorktreeService: vi.fn() }))
    vi.doMock('../../agent-workspace/main/agent-session-handler', () => ({
      createManagedProjectAgentSession: vi.fn()
    }))
    vi.doMock('../../agent-workspace/main/agent-skill-settings.service', () => ({
      getDisabledGlobalSkillPaths: vi.fn()
    }))
    vi.doMock('../../agent-workspace/main/agent-skill-paths', () => ({
      resolveAgentSkillPaths: vi.fn()
    }))
    vi.doMock('../../agent-workspace/main/agent-utility-process', () => ({
      getAgentUtilityProcessHost: vi.fn()
    }))

    const { registerSessionsIpc } = await import('./sessions.ipc')
    registerSessionsIpc()

    await expect(
      handlers.get('sessions:getCurrentGlobalChatContext')?.({}, undefined)
    ).resolves.toEqual(context)
    expect(getOrCreateCurrentChatContext).toHaveBeenCalledOnce()

    await expect(handlers.get('sessions:listGlobalChatHistory')?.({}, undefined)).resolves.toEqual(
      history
    )
    await expect(
      handlers.get('sessions:resumeGlobalChat')?.({}, { chatContextId: 'global-chat-context-1' })
    ).resolves.toEqual(context)
    await expect(handlers.get('sessions:clearGlobalChat')?.({}, undefined)).resolves.toEqual(
      context
    )
    expect(listChatHistory).toHaveBeenCalledOnce()
    expect(resumeChatContext).toHaveBeenCalledWith('global-chat-context-1')
    expect(clearChat).toHaveBeenCalledOnce()
  })
})
