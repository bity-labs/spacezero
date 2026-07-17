import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  cancelGitHubCloneRequestSchema,
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
  getGitHubRepositorySetupService
} from './github-runtime'

export function registerGitHubIpc(): void {
  ipcMain.handle(IPC_CHANNELS.github.getConnection, () =>
    getGitHubConnectionService().getConnection()
  )
  ipcMain.handle(IPC_CHANNELS.github.startAuthorization, () =>
    getGitHubAuthService().startAuthorization()
  )
  ipcMain.handle(IPC_CHANNELS.github.waitForAuthorization, (_event, input: unknown) =>
    getGitHubAuthService().waitForAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.cancelAuthorization, (_event, input: unknown) =>
    getGitHubAuthService().cancelAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.openAuthorization, (_event, input: unknown) =>
    getGitHubAuthService().openAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.copyDeviceCode, (_event, input: unknown) =>
    getGitHubAuthService().copyDeviceCode(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.openInstallation, () =>
    getGitHubConnectionService().openInstallation()
  )
  ipcMain.handle(IPC_CHANNELS.github.openManageAccess, () =>
    getGitHubConnectionService().openManageAccess()
  )
  ipcMain.handle(IPC_CHANNELS.github.disconnect, () => getGitHubAuthService().disconnect())
  ipcMain.handle(IPC_CHANNELS.github.listAuthorizedRepositories, () =>
    getGitHubConnectionService().listAuthorizedRepositories()
  )
  ipcMain.handle(IPC_CHANNELS.github.getProjectLinkOptions, (_event, input: unknown) =>
    getGitHubProjectsService().getLinkOptions(githubProjectRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.linkProjectRepository, (_event, input: unknown) =>
    getGitHubProjectsService().linkProject(linkGitHubProjectRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.getProjectRepository, (_event, input: unknown) =>
    getGitHubProjectsService().getLinkedRepository(githubProjectRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.listRepositorySetupOptions, () =>
    getGitHubRepositorySetupService().listSetupOptions()
  )
  ipcMain.handle(IPC_CHANNELS.github.startClone, (event, input: unknown) =>
    getGitHubRepositorySetupService().startClone(
      startGitHubCloneRequestSchema.parse(input),
      (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.github.cloneProgress, progress)
        }
      }
    )
  )
  ipcMain.handle(IPC_CHANNELS.github.cancelClone, (_event, input: unknown) =>
    getGitHubRepositorySetupService().cancelClone(cancelGitHubCloneRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.listIssues, (_event, input: unknown) =>
    getGitHubIssuesService().listIssues(githubIssueListRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.getIssue, (_event, input: unknown) =>
    getGitHubIssuesService().getIssue(githubIssueRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.listIssueComments, (_event, input: unknown) =>
    getGitHubIssuesService().listIssueComments(githubIssueCommentsRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.createIssueComment, (_event, input: unknown) =>
    getGitHubIssuesService().createIssueComment(githubIssueCommentCreateRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.updateIssueState, (_event, input: unknown) =>
    getGitHubIssuesService().updateIssueState(githubIssueStateUpdateRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.listPullRequests, (_event, input: unknown) =>
    getGitHubPullRequestsService().listPullRequests(githubPullRequestListRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.getPullRequest, (_event, input: unknown) =>
    getGitHubPullRequestsService().getPullRequest(githubPullRequestRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.listPullRequestComments, (_event, input: unknown) =>
    getGitHubPullRequestsService().listConversationComments(
      githubPullRequestCommentsRequestSchema.parse(input)
    )
  )
  ipcMain.handle(IPC_CHANNELS.github.listPullRequestFiles, (_event, input: unknown) =>
    getGitHubPullRequestsService().listFiles(githubPullRequestPageRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.listPullRequestCheckRuns, (_event, input: unknown) =>
    getGitHubPullRequestsService().listCheckRuns(githubPullRequestPageRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.listPullRequestCommitStatuses, (_event, input: unknown) =>
    getGitHubPullRequestsService().listCommitStatuses(
      githubPullRequestPageRequestSchema.parse(input)
    )
  )
  ipcMain.handle(IPC_CHANNELS.github.listPullRequestReviews, (_event, input: unknown) =>
    getGitHubPullRequestsService().listReviews(githubPullRequestPageRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.createPullRequestComment, (_event, input: unknown) =>
    getGitHubPullRequestsService().createConversationComment(
      githubPullRequestCommentCreateRequestSchema.parse(input)
    )
  )
  ipcMain.handle(IPC_CHANNELS.github.createPullRequestReview, (_event, input: unknown) =>
    getGitHubPullRequestsService().createReview(
      githubPullRequestReviewCreateRequestSchema.parse(input)
    )
  )
}
