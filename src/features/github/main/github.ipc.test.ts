import { describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  registerGitHubIpcHandlers,
  type GitHubIpcEvent,
  type GitHubIpcRegistrar,
  type GitHubIpcRuntime
} from './github.ipc'

type Handler = (event: GitHubIpcEvent, input?: unknown) => unknown

function createBoundary() {
  const handlers = new Map<string, Handler>()
  const registrar: GitHubIpcRegistrar = {
    handle(channel, listener) {
      handlers.set(channel, listener)
    }
  }

  const calls = {
    waitForAuthorization: vi.fn(),
    cancelAuthorization: vi.fn(),
    openAuthorization: vi.fn(),
    copyDeviceCode: vi.fn(),
    getLinkOptions: vi.fn(),
    linkProject: vi.fn(),
    getLinkedRepository: vi.fn(),
    startClone: vi.fn(),
    cancelClone: vi.fn(),
    listIssues: vi.fn(),
    getIssue: vi.fn(),
    listIssueComments: vi.fn(),
    createIssueComment: vi.fn(),
    updateIssueState: vi.fn(),
    listPullRequests: vi.fn(),
    getPullRequest: vi.fn(),
    listConversationComments: vi.fn(),
    listCommits: vi.fn(),
    listFiles: vi.fn(),
    listCheckRuns: vi.fn(),
    listCommitStatuses: vi.fn(),
    listReviews: vi.fn(),
    createConversationComment: vi.fn(),
    createReview: vi.fn(),
    createOrReusePullRequest: vi.fn(),
    startIssueSession: vi.fn(),
    startPullRequestSession: vi.fn()
  }

  const runtime = {
    getAuthService: () => ({
      getConnection: vi.fn(),
      getAuthorizedCredential: vi.fn(),
      getAuthorizationGeneration: vi.fn(),
      disconnect: vi.fn(),
      startAuthorization: vi.fn(),
      waitForAuthorization: calls.waitForAuthorization,
      cancelAuthorization: calls.cancelAuthorization,
      openAuthorization: calls.openAuthorization,
      copyDeviceCode: calls.copyDeviceCode
    }),
    getConnectionService: () => ({
      getConnection: vi.fn(),
      refreshConnection: vi.fn(),
      listAuthorizedRepositories: vi.fn(),
      openInstallation: vi.fn(),
      openManageAccess: vi.fn()
    }),
    getProjectsService: () => ({
      getLinkOptions: calls.getLinkOptions,
      linkProject: calls.linkProject,
      getLinkedRepository: calls.getLinkedRepository
    }),
    getRepositorySetupService: () => ({
      listSetupOptions: vi.fn(),
      startClone: calls.startClone,
      cancelClone: calls.cancelClone
    }),
    getIssuesService: () => ({
      listIssues: calls.listIssues,
      getIssue: calls.getIssue,
      listIssueComments: calls.listIssueComments,
      createIssueComment: calls.createIssueComment,
      updateIssueState: calls.updateIssueState
    }),
    getPullRequestsService: () => ({
      listPullRequests: calls.listPullRequests,
      getPullRequest: calls.getPullRequest,
      listConversationComments: calls.listConversationComments,
      listCommits: calls.listCommits,
      listFiles: calls.listFiles,
      listCheckRuns: calls.listCheckRuns,
      listCommitStatuses: calls.listCommitStatuses,
      listReviews: calls.listReviews,
      createConversationComment: calls.createConversationComment,
      createReview: calls.createReview,
      createOrReusePullRequest: calls.createOrReusePullRequest
    }),
    getSourceSessionsService: () => ({
      startIssueSession: calls.startIssueSession,
      startPullRequestSession: calls.startPullRequestSession
    })
  } as unknown as GitHubIpcRuntime

  registerGitHubIpcHandlers(registrar, runtime)

  const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
  const event: GitHubIpcEvent = { sender }
  const invoke = (channel: string, input?: unknown): unknown => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return handler(event, input)
  }

  return { calls, invoke, sender }
}

describe('GitHub IPC boundary', () => {
  it('rejects malformed identifiers and commands before privileged services run', () => {
    const { calls, invoke } = createBoundary()
    const malformedRequests: Array<[string, unknown]> = [
      [IPC_CHANNELS.github.waitForAuthorization, { flowId: '   ' }],
      [IPC_CHANNELS.github.getProjectLinkOptions, { projectId: '' }],
      [IPC_CHANNELS.github.linkProjectRepository, { projectId: 'project-1', repositoryId: '../1' }],
      [IPC_CHANNELS.github.startClone, { repositoryId: 'not-numeric' }],
      [IPC_CHANNELS.github.cancelClone, { operationId: '' }],
      [IPC_CHANNELS.github.listIssues, { projectId: 'project-1', page: 0 }],
      [IPC_CHANNELS.github.getIssue, { projectId: 'project-1', number: 0 }],
      [IPC_CHANNELS.github.createIssueComment, { projectId: 'project-1', number: 1, body: '   ' }],
      [
        IPC_CHANNELS.github.updateIssueState,
        { projectId: 'project-1', number: 1, state: 'merged' }
      ],
      [IPC_CHANNELS.github.listPullRequests, { projectId: 'project-1', page: 1, perPage: 101 }],
      [IPC_CHANNELS.github.getPullRequest, { projectId: 'project-1', number: -1 }],
      [IPC_CHANNELS.github.listPullRequestCommits, { projectId: 'project-1', number: 1, page: 0 }],
      [
        IPC_CHANNELS.github.createPullRequestComment,
        { projectId: 'project-1', number: 1, body: '' }
      ],
      [
        IPC_CHANNELS.github.createPullRequestReview,
        { projectId: 'project-1', number: 1, event: 'REQUEST_CHANGES' }
      ],
      [
        IPC_CHANNELS.github.createOrReusePullRequest,
        { sessionId: 'session-1', expectedHeadSha: 'not-a-sha', title: 'PR' }
      ],
      [IPC_CHANNELS.github.startIssueSession, { projectId: '', number: 1 }],
      [IPC_CHANNELS.github.startPullRequestSession, { projectId: 'project-1', number: 0 }]
    ]

    for (const [channel, input] of malformedRequests) {
      expect(() => invoke(channel, input), channel).toThrow()
    }
    for (const privilegedCall of Object.values(calls)) {
      expect(privilegedCall).not.toHaveBeenCalled()
    }
  })

  it('routes representative typed requests and clone progress through registered handlers', async () => {
    const { calls, invoke, sender } = createBoundary()
    calls.waitForAuthorization.mockResolvedValue({ status: 'disconnected' })
    calls.updateIssueState.mockResolvedValue({ number: 86 })
    calls.createReview.mockResolvedValue({ id: 'review-1' })
    calls.createOrReusePullRequest.mockResolvedValue({
      status: 'reused',
      pushStatus: 'succeeded',
      pullRequest: { number: 100 }
    })
    calls.listCommits.mockResolvedValue({ items: [], page: 2, hasNextPage: false })
    calls.startClone.mockImplementation(async (_request, emit) => {
      emit({ operationId: 'clone-1', status: 'cloning', message: 'Cloning…', percent: 50 })
      return { status: 'started', operationId: 'clone-1' }
    })

    await expect(
      invoke(IPC_CHANNELS.github.waitForAuthorization, { flowId: ' flow-1 ' })
    ).resolves.toEqual({ status: 'disconnected' })
    await invoke(IPC_CHANNELS.github.updateIssueState, {
      projectId: ' project-1 ',
      number: 86,
      state: 'closed'
    })
    await invoke(IPC_CHANNELS.github.createPullRequestReview, {
      projectId: 'project-1',
      number: 100,
      event: 'REQUEST_CHANGES',
      body: '  Add a concurrency test.  '
    })
    await invoke(IPC_CHANNELS.github.createOrReusePullRequest, {
      sessionId: ' session-1 ',
      expectedHeadSha: '0123456789abcdef0123456789abcdef01234567',
      title: '  Create PR  '
    })
    await invoke(IPC_CHANNELS.github.listPullRequestCommits, {
      projectId: 'project-1',
      number: 100,
      page: 2
    })
    await expect(invoke(IPC_CHANNELS.github.startClone, { repositoryId: '1000' })).resolves.toEqual(
      { status: 'started', operationId: 'clone-1' }
    )

    expect(calls.waitForAuthorization).toHaveBeenCalledWith({ flowId: 'flow-1' })
    expect(calls.updateIssueState).toHaveBeenCalledWith({
      projectId: 'project-1',
      number: 86,
      state: 'closed'
    })
    expect(calls.createReview).toHaveBeenCalledWith({
      projectId: 'project-1',
      number: 100,
      event: 'REQUEST_CHANGES',
      body: 'Add a concurrency test.'
    })
    expect(calls.createOrReusePullRequest).toHaveBeenCalledWith({
      sessionId: 'session-1',
      expectedHeadSha: '0123456789abcdef0123456789abcdef01234567',
      title: 'Create PR'
    })
    expect(calls.listCommits).toHaveBeenCalledWith({
      projectId: 'project-1',
      number: 100,
      page: 2
    })
    expect(calls.startClone).toHaveBeenCalledWith(
      { repositoryId: '1000', agentResourcesTrusted: false },
      expect.any(Function)
    )
    expect(sender.send).toHaveBeenCalledWith(IPC_CHANNELS.github.cloneProgress, {
      operationId: 'clone-1',
      status: 'cloning',
      message: 'Cloning…',
      percent: 50
    })
  })
})
