import { useState, type ReactNode } from 'react'

import type { GitHubProjectLinkOptions } from '../../../github/shared'
import {
  IssuesView,
  IssuesViewLoading,
  ProjectGitHubOverview,
  ProjectGitHubOverviewLoading,
  PullRequestsView,
  PullRequestsViewLoading,
  useGitHubConnection,
  useProjectRepository
} from '../../../github/renderer'
import type { ProjectSession } from '../../../sessions/shared'
import type { Project } from '../../shared'
import {
  ProjectHomeScreen,
  type ProjectHomeGitHubState,
  type ProjectHomeView
} from './project-home-screen'
import { projectSessionSetupErrorMessage } from '../project-session-error-message'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

export type ProjectHomeGitHubTarget = {
  type: 'issue' | 'pull-request'
  number: number
}

export function ProjectHome({
  project,
  onProjectLinked,
  onNewSession,
  onSessionCreated,
  initialGitHubTarget
}: {
  project: Project
  onProjectLinked: (project: Project) => void
  onNewSession: () => void | Promise<void>
  onSessionCreated?: (session: ProjectSession) => void
  initialGitHubTarget?: ProjectHomeGitHubTarget | null
}): React.JSX.Element {
  const [displayProject, setDisplayProject] = useState(project)
  const [view, setView] = useState<ProjectHomeView>(
    initialGitHubTarget?.type === 'issue'
      ? 'issues'
      : initialGitHubTarget?.type === 'pull-request'
        ? 'pull-requests'
        : 'overview'
  )
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(
    initialGitHubTarget?.type === 'issue' ? initialGitHubTarget.number : null
  )
  const [selectedPullRequestNumber, setSelectedPullRequestNumber] = useState<number | null>(
    initialGitHubTarget?.type === 'pull-request' ? initialGitHubTarget.number : null
  )
  const { connection, isLoading: connectionLoading } = useGitHubConnection()
  const connected = connection?.status === 'connected'
  const repository = useProjectRepository(
    displayProject.id,
    Boolean(
      displayProject.githubRepository && connected && !connectionLoading && view === 'overview'
    )
  )
  const [linkOptions, setLinkOptions] = useState<GitHubProjectLinkOptions | null>(null)
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [isSavingLink, setIsSavingLink] = useState(false)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isSavingTrust, setIsSavingTrust] = useState(false)
  const [trustError, setTrustError] = useState<string | null>(null)
  const [sessionSetupError, setSessionSetupError] = useState<string | null>(null)

  async function startSession(): Promise<void> {
    setIsStartingSession(true)
    setSessionSetupError(null)
    try {
      await onNewSession()
    } catch (error) {
      setSessionSetupError(projectSessionSetupErrorMessage(error))
    } finally {
      setIsStartingSession(false)
    }
  }

  async function loadLinkOptions(): Promise<void> {
    setIsLoadingOptions(true)
    setLinkError(null)
    try {
      const options = await window.spacezero.github.getProjectLinkOptions({
        projectId: displayProject.id
      })
      setLinkOptions(options)
      setSelectedRepositoryId(
        options.suggestedRepositoryIds.length === 1 ? options.suggestedRepositoryIds[0] : null
      )
    } catch {
      setLinkError('Unable to load authorized GitHub repositories.')
    } finally {
      setIsLoadingOptions(false)
    }
  }

  async function updateAgentResourceTrust(trusted: boolean): Promise<void> {
    setIsSavingTrust(true)
    setTrustError(null)
    try {
      const updatedProject = await window.spacezero.projects.update({
        id: displayProject.id,
        name: displayProject.name,
        path: displayProject.path,
        agentResourcesTrusted: trusted
      })
      setDisplayProject(updatedProject)
      onProjectLinked(updatedProject)
    } catch {
      setTrustError('Unable to update project agent-resource trust.')
    } finally {
      setIsSavingTrust(false)
    }
  }

  async function linkRepository(): Promise<void> {
    if (!selectedRepositoryId || !linkOptions) return
    if (
      linkOptions.ambiguous &&
      !window.confirm(
        'Multiple GitHub repositories match this Project’s remotes. Link the selected repository?'
      )
    ) {
      return
    }

    setIsSavingLink(true)
    setLinkError(null)
    try {
      const linkedProject = await window.spacezero.github.linkProjectRepository({
        projectId: displayProject.id,
        repositoryId: selectedRepositoryId,
        ...(linkOptions.ambiguous ? { confirmAmbiguous: true } : {})
      })
      setDisplayProject(linkedProject)
      setLinkOptions(null)
      onProjectLinked(linkedProject)
    } catch {
      setLinkError('Unable to link this repository. Refresh access and try again.')
    } finally {
      setIsSavingLink(false)
    }
  }

  function selectView(nextView: ProjectHomeView): void {
    if (nextView === 'issues') setSelectedIssueNumber(null)
    if (nextView === 'pull-requests') setSelectedPullRequestNumber(null)
    setView(nextView)
  }

  const githubState: ProjectHomeGitHubState = connectionLoading
    ? { status: 'loading' }
    : !connected
      ? { status: 'disconnected' }
      : !displayProject.githubRepository
        ? {
            status: 'link-needed',
            linkOptions,
            selectedRepositoryId,
            error: linkError,
            isLoadingOptions,
            isSavingLink
          }
        : repository.isLoading
          ? { status: 'repository-loading' }
          : repository.isError || !repository.data
            ? {
                status: 'repository-error',
                message: getRepositoryErrorMessage(repository.error)
              }
            : { status: 'connected', repository: repository.data }

  const summaryContent = displayProject.githubRepository ? (
    connectionLoading ? (
      <ProjectGitHubOverviewLoading
        onViewIssues={() => selectView('issues')}
        onViewPullRequests={() => selectView('pull-requests')}
      />
    ) : connected ? (
      <ProjectGitHubOverview
        project={displayProject}
        onOpenIssue={(number) => {
          setSelectedIssueNumber(number)
          setView('issues')
        }}
        onViewIssues={() => selectView('issues')}
        onOpenPullRequest={(number) => {
          setSelectedPullRequestNumber(number)
          setView('pull-requests')
        }}
        onViewPullRequests={() => selectView('pull-requests')}
      />
    ) : null
  ) : null

  const workflowContent =
    view === 'issues' ? (
      <GitHubWorkflowGate
        project={displayProject}
        connectionLoading={connectionLoading}
        connected={connected}
        loadingPlaceholder={<IssuesViewLoading />}
        onShowOverview={() => setView('overview')}
      >
        <IssuesView
          key={selectedIssueNumber ?? 'issue-list'}
          project={displayProject}
          initialIssueNumber={selectedIssueNumber}
          onSessionCreated={onSessionCreated}
        />
      </GitHubWorkflowGate>
    ) : view === 'pull-requests' ? (
      <GitHubWorkflowGate
        project={displayProject}
        connectionLoading={connectionLoading}
        connected={connected}
        loadingPlaceholder={<PullRequestsViewLoading />}
        onShowOverview={() => setView('overview')}
      >
        <PullRequestsView
          key={selectedPullRequestNumber ?? 'pull-request-list'}
          project={displayProject}
          initialPullRequestNumber={selectedPullRequestNumber}
          onSessionCreated={onSessionCreated}
        />
      </GitHubWorkflowGate>
    ) : null

  return (
    <ProjectHomeScreen
      project={displayProject}
      activeView={view}
      isStartingSession={isStartingSession}
      sessionSetupError={sessionSetupError}
      githubState={githubState}
      agentResourceTrust={{
        trusted: displayProject.agentResourcesTrusted === true,
        isSaving: isSavingTrust,
        error: trustError
      }}
      summaryContent={summaryContent}
      workflowContent={workflowContent}
      onSelectView={selectView}
      onNewSession={() => void startSession()}
      onLoadLinkOptions={() => void loadLinkOptions()}
      onSelectRepository={setSelectedRepositoryId}
      onLinkRepository={() => void linkRepository()}
      onRetryRepository={() => void repository.refetch()}
      onAgentResourceTrustChange={(trusted) => void updateAgentResourceTrust(trusted)}
    />
  )
}

function GitHubWorkflowGate({
  project,
  connectionLoading,
  connected,
  loadingPlaceholder,
  onShowOverview,
  children
}: {
  project: Project
  connectionLoading: boolean
  connected: boolean
  loadingPlaceholder: ReactNode
  onShowOverview: () => void
  children: ReactNode
}): React.JSX.Element {
  if (connectionLoading) return <>{loadingPlaceholder}</>
  if (!connected) {
    return (
      <Card className="gap-3 p-6">
        <h2 className="font-medium">Connect GitHub to continue</h2>
        <p className="text-sm text-muted-foreground">
          This Project workflow reads live data from GitHub.
        </p>
        <a
          className="text-sm font-medium text-primary hover:underline"
          href="#/settings?section=account"
        >
          Connect GitHub
        </a>
      </Card>
    )
  }
  if (!project.githubRepository) {
    return (
      <Card className="gap-3 p-6">
        <h2 className="font-medium">Link a GitHub repository</h2>
        <p className="text-sm text-muted-foreground">
          Link this Project before opening repository workflows.
        </p>
        <Button className="w-fit" variant="outline" onClick={onShowOverview}>
          Link GitHub repository
        </Button>
      </Card>
    )
  }
  return <>{children}</>
}

function getRepositoryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('repositoryAccessRevoked')) {
    return 'Repository access changed or was revoked. Update GitHub App access and try again.'
  }
  if (message.includes('reconnect-required')) {
    return 'Your GitHub authorization expired or was revoked. Reconnect GitHub and try again.'
  }
  return 'Check your network or GitHub rate limit, then retry.'
}
