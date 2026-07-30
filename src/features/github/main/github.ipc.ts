import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  cancelGitHubCloneRequestSchema,
  githubCreateOrReusePullRequestRequestSchema,
  githubFlowRequestSchema,
  githubIssueCommentCreateRequestSchema,
  githubIssueCommentsRequestSchema,
  githubIssueListRequestSchema,
  githubIssueRequestSchema,
  githubIssueStateUpdateRequestSchema,
  githubProjectRequestSchema,
  githubPullRequestCommentCreateRequestSchema,
  githubPullRequestCommentsRequestSchema,
  githubPullRequestListRequestSchema,
  githubPullRequestPageRequestSchema,
  githubPullRequestRequestSchema,
  githubPullRequestReviewCreateRequestSchema,
  linkGitHubProjectRequestSchema,
  startGitHubCloneRequestSchema
} from '../shared'
import {
  getGitHubAuthService,
  getGitHubConnectionService,
  getGitHubIssuesService,
  getGitHubProjectsService,
  getGitHubPullRequestsService,
  getGitHubRepositorySetupService,
  getGitHubSourceSessionsService
} from './github-runtime'

export type GitHubIpcEvent = {
  sender: {
    isDestroyed: () => boolean
    send: (channel: string, payload: unknown) => void
  }
}

export type GitHubIpcRegistrar = {
  handle: (channel: string, listener: (event: GitHubIpcEvent, input?: unknown) => unknown) => void
}

export type GitHubIpcRuntime = {
  getAuthService: typeof getGitHubAuthService
  getConnectionService: typeof getGitHubConnectionService
  getIssuesService: typeof getGitHubIssuesService
  getProjectsService: typeof getGitHubProjectsService
  getPullRequestsService: typeof getGitHubPullRequestsService
  getRepositorySetupService: typeof getGitHubRepositorySetupService
  getSourceSessionsService: typeof getGitHubSourceSessionsService
}

const defaultRuntime: GitHubIpcRuntime = {
  getAuthService: getGitHubAuthService,
  getConnectionService: getGitHubConnectionService,
  getIssuesService: getGitHubIssuesService,
  getProjectsService: getGitHubProjectsService,
  getPullRequestsService: getGitHubPullRequestsService,
  getRepositorySetupService: getGitHubRepositorySetupService,
  getSourceSessionsService: getGitHubSourceSessionsService
}

export function registerGitHubIpc(): void {
  registerGitHubIpcHandlers(ipcMain as unknown as GitHubIpcRegistrar, defaultRuntime)
}

export function registerGitHubIpcHandlers(
  ipc: GitHubIpcRegistrar,
  runtime: GitHubIpcRuntime
): void {
  ipc.handle(IPC_CHANNELS.github.getConnection, () =>
    runtime.getConnectionService().getConnection()
  )
  ipc.handle(IPC_CHANNELS.github.refreshConnection, () =>
    runtime.getConnectionService().refreshConnection()
  )
  ipc.handle(IPC_CHANNELS.github.startAuthorization, () =>
    runtime.getAuthService().startAuthorization()
  )
  ipc.handle(IPC_CHANNELS.github.waitForAuthorization, (_event, input) =>
    runtime.getAuthService().waitForAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.cancelAuthorization, (_event, input) =>
    runtime.getAuthService().cancelAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.openAuthorization, (_event, input) =>
    runtime.getAuthService().openAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.copyDeviceCode, (_event, input) =>
    runtime.getAuthService().copyDeviceCode(githubFlowRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.openInstallation, () =>
    runtime.getConnectionService().openInstallation()
  )
  ipc.handle(IPC_CHANNELS.github.openManageAccess, () =>
    runtime.getConnectionService().openManageAccess()
  )
  ipc.handle(IPC_CHANNELS.github.disconnect, () => runtime.getAuthService().disconnect())
  ipc.handle(IPC_CHANNELS.github.listAuthorizedRepositories, () =>
    runtime.getConnectionService().listAuthorizedRepositories()
  )
  ipc.handle(IPC_CHANNELS.github.getProjectLinkOptions, (_event, input) =>
    runtime.getProjectsService().getLinkOptions(githubProjectRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.linkProjectRepository, (_event, input) =>
    runtime.getProjectsService().linkProject(linkGitHubProjectRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.getProjectRepository, (_event, input) =>
    runtime.getProjectsService().getLinkedRepository(githubProjectRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listRepositorySetupOptions, () =>
    runtime.getRepositorySetupService().listSetupOptions()
  )
  ipc.handle(IPC_CHANNELS.github.startClone, (event, input) =>
    runtime
      .getRepositorySetupService()
      .startClone(startGitHubCloneRequestSchema.parse(input), (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.github.cloneProgress, progress)
        }
      })
  )
  ipc.handle(IPC_CHANNELS.github.cancelClone, (_event, input) =>
    runtime.getRepositorySetupService().cancelClone(cancelGitHubCloneRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listIssues, (_event, input) =>
    runtime.getIssuesService().listIssues(githubIssueListRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.getIssue, (_event, input) =>
    runtime.getIssuesService().getIssue(githubIssueRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listIssueComments, (_event, input) =>
    runtime.getIssuesService().listIssueComments(githubIssueCommentsRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.createIssueComment, (_event, input) =>
    runtime
      .getIssuesService()
      .createIssueComment(githubIssueCommentCreateRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.updateIssueState, (_event, input) =>
    runtime.getIssuesService().updateIssueState(githubIssueStateUpdateRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listPullRequests, (_event, input) =>
    runtime
      .getPullRequestsService()
      .listPullRequests(githubPullRequestListRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.getPullRequest, (_event, input) =>
    runtime.getPullRequestsService().getPullRequest(githubPullRequestRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listPullRequestComments, (_event, input) =>
    runtime
      .getPullRequestsService()
      .listConversationComments(githubPullRequestCommentsRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listPullRequestCommits, (_event, input) =>
    runtime.getPullRequestsService().listCommits(githubPullRequestPageRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listPullRequestFiles, (_event, input) =>
    runtime.getPullRequestsService().listFiles(githubPullRequestPageRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listPullRequestCheckRuns, (_event, input) =>
    runtime.getPullRequestsService().listCheckRuns(githubPullRequestPageRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listPullRequestCommitStatuses, (_event, input) =>
    runtime
      .getPullRequestsService()
      .listCommitStatuses(githubPullRequestPageRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.listPullRequestReviews, (_event, input) =>
    runtime.getPullRequestsService().listReviews(githubPullRequestPageRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.createPullRequestComment, (_event, input) =>
    runtime
      .getPullRequestsService()
      .createConversationComment(githubPullRequestCommentCreateRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.createPullRequestReview, (_event, input) =>
    runtime
      .getPullRequestsService()
      .createReview(githubPullRequestReviewCreateRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.createOrReusePullRequest, (_event, input) =>
    runtime
      .getPullRequestsService()
      .createOrReusePullRequest(githubCreateOrReusePullRequestRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.startIssueSession, (_event, input) =>
    runtime.getSourceSessionsService().startIssueSession(githubIssueRequestSchema.parse(input))
  )
  ipc.handle(IPC_CHANNELS.github.startPullRequestSession, (_event, input) =>
    runtime
      .getSourceSessionsService()
      .startPullRequestSession(githubPullRequestRequestSchema.parse(input))
  )
}
