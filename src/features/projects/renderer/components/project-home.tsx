import { useState, type ReactNode } from 'react'
import { ArrowClockwise, ArrowSquareOut, GithubLogo, LinkSimple, Plus } from '@phosphor-icons/react'

import type { GitHubProjectLinkOptions } from '../../../github/shared'
import {
  IssuesView,
  ProjectGitHubOverview,
  PullRequestsView,
  useGitHubConnection,
  useProjectRepository
} from '../../../github/renderer'
import type { ProjectSession } from '../../../sessions/shared'
import type { Project } from '../../shared'
import { AgentResourceTrustCheckbox } from './agent-resource-trust-checkbox'
import { projectSessionSetupErrorMessage } from '../project-session-error-message'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

type ProjectHomeView = 'overview' | 'issues' | 'pull-requests'

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="border-b px-8 pb-0 pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project Home
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{displayProject.name}</h1>
          </div>
          <Button
            className="gap-2"
            disabled={isStartingSession}
            onClick={() => void startSession()}
          >
            <Plus className="size-4" aria-hidden="true" />
            {isStartingSession ? 'Starting Session…' : 'New session'}
          </Button>
        </div>
        <nav aria-label="Project Home" className="mt-7 flex gap-1">
          <ProjectHomeTab active={view === 'overview'} onClick={() => setView('overview')}>
            Overview
          </ProjectHomeTab>
          <ProjectHomeTab
            active={view === 'issues'}
            onClick={() => {
              setSelectedIssueNumber(null)
              setView('issues')
            }}
          >
            Issues
          </ProjectHomeTab>
          <ProjectHomeTab
            active={view === 'pull-requests'}
            onClick={() => {
              setSelectedPullRequestNumber(null)
              setView('pull-requests')
            }}
          >
            Pull Requests
          </ProjectHomeTab>
        </nav>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-5 p-8">
        {sessionSetupError ? (
          <div className="rounded-lg border border-destructive/40 p-4" role="alert">
            <p className="text-sm">{sessionSetupError}</p>
          </div>
        ) : null}
        {view === 'overview' ? (
          <>
            <ProjectAgentResourceTrustCard
              project={displayProject}
              isSaving={isSavingTrust}
              error={trustError}
              onChange={(trusted) => void updateAgentResourceTrust(trusted)}
            />
            <GitHubProjectState
              project={displayProject}
              connection={connection}
              connectionLoading={connectionLoading}
              linkOptions={linkOptions}
              selectedRepositoryId={selectedRepositoryId}
              linkError={linkError}
              isLoadingOptions={isLoadingOptions}
              isSavingLink={isSavingLink}
              onLoadLinkOptions={() => void loadLinkOptions()}
              onSelectRepository={setSelectedRepositoryId}
              onLinkRepository={() => void linkRepository()}
            />
            {!connectionLoading &&
            connection?.status === 'connected' &&
            displayProject.githubRepository ? (
              <ProjectGitHubOverview
                project={displayProject}
                onOpenIssue={(number) => {
                  setSelectedIssueNumber(number)
                  setView('issues')
                }}
                onViewIssues={() => {
                  setSelectedIssueNumber(null)
                  setView('issues')
                }}
                onOpenPullRequest={(number) => {
                  setSelectedPullRequestNumber(number)
                  setView('pull-requests')
                }}
                onViewPullRequests={() => {
                  setSelectedPullRequestNumber(null)
                  setView('pull-requests')
                }}
              />
            ) : null}
          </>
        ) : view === 'issues' ? (
          <GitHubWorkflowGate
            project={displayProject}
            connectionLoading={connectionLoading}
            connected={connection?.status === 'connected'}
            onShowOverview={() => setView('overview')}
          >
            <IssuesView
              key={selectedIssueNumber ?? 'issue-list'}
              project={displayProject}
              initialIssueNumber={selectedIssueNumber}
              onSessionCreated={onSessionCreated}
            />
          </GitHubWorkflowGate>
        ) : (
          <GitHubWorkflowGate
            project={displayProject}
            connectionLoading={connectionLoading}
            connected={connection?.status === 'connected'}
            onShowOverview={() => setView('overview')}
          >
            <PullRequestsView
              key={selectedPullRequestNumber ?? 'pull-request-list'}
              project={displayProject}
              initialPullRequestNumber={selectedPullRequestNumber}
              onSessionCreated={onSessionCreated}
            />
          </GitHubWorkflowGate>
        )}
      </div>
    </div>
  )
}

function ProjectAgentResourceTrustCard({
  project,
  isSaving,
  error,
  onChange
}: {
  project: Project
  isSaving: boolean
  error: string | null
  onChange: (trusted: boolean) => void
}): React.JSX.Element {
  return (
    <Card className="gap-3 p-6">
      <AgentResourceTrustCheckbox
        checked={project.agentResourcesTrusted === true}
        disabled={isSaving}
        onCheckedChange={onChange}
      />
      <p className="text-xs text-muted-foreground">
        Changes apply to new or explicitly reloaded Project Sessions. Live Sessions keep their
        currently loaded resources.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Card>
  )
}

function ProjectHomeTab({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'border-b-2 px-3 pb-3 text-sm text-muted-foreground transition-colors hover:text-foreground',
        active ? 'border-foreground text-foreground' : 'border-transparent'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function GitHubProjectState({
  project,
  connection,
  connectionLoading,
  linkOptions,
  selectedRepositoryId,
  linkError,
  isLoadingOptions,
  isSavingLink,
  onLoadLinkOptions,
  onSelectRepository,
  onLinkRepository
}: {
  project: Project
  connection: ReturnType<typeof useGitHubConnection>['connection']
  connectionLoading: boolean
  linkOptions: GitHubProjectLinkOptions | null
  selectedRepositoryId: string | null
  linkError: string | null
  isLoadingOptions: boolean
  isSavingLink: boolean
  onLoadLinkOptions: () => void
  onSelectRepository: (repositoryId: string) => void
  onLinkRepository: () => void
}): React.JSX.Element {
  if (connectionLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Checking GitHub connection…</Card>
  }

  if (connection?.status !== 'connected') {
    return (
      <Card className="gap-4 p-6">
        <div>
          <h2 className="font-medium">Connect GitHub</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect GitHub to link this Project and browse its Issues and Pull Requests.
          </p>
        </div>
        <Button render={<a href="#/settings?section=account" />} className="w-fit gap-2">
          <GithubLogo className="size-4" aria-hidden="true" />
          Connect GitHub
        </Button>
      </Card>
    )
  }

  if (project.githubRepository) {
    return <LinkedRepositoryStatus project={project} />
  }

  return (
    <Card className="gap-4 p-6">
      <div>
        <h2 className="font-medium">Link GitHub repository</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Associate this local Project with one authorized repository. Space Zero stores metadata
          only and never changes Git remotes or moves the Project.
        </p>
      </div>

      {!linkOptions ? (
        <Button className="w-fit gap-2" disabled={isLoadingOptions} onClick={onLoadLinkOptions}>
          <LinkSimple className="size-4" aria-hidden="true" />
          {isLoadingOptions ? 'Loading repositories…' : 'Link GitHub repository'}
        </Button>
      ) : linkOptions.repositories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No authorized repositories are available.</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Authorized repositories</legend>
          {linkOptions.repositories.map((repository) => {
            const suggested = linkOptions.suggestedRepositoryIds.includes(repository.id)
            return (
              <label
                key={repository.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <input
                  type="radio"
                  name="github-repository"
                  value={repository.id}
                  checked={selectedRepositoryId === repository.id}
                  onChange={() => onSelectRepository(repository.id)}
                />
                <span>
                  <span className="block text-sm font-medium">{repository.fullName}</span>
                  {suggested ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Matches a local Git remote
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
          <Button disabled={!selectedRepositoryId || isSavingLink} onClick={onLinkRepository}>
            {isSavingLink ? 'Linking…' : 'Link repository'}
          </Button>
        </fieldset>
      )}

      {linkError ? <p className="text-sm text-destructive">{linkError}</p> : null}
    </Card>
  )
}

function LinkedRepositoryStatus({ project }: { project: Project }): React.JSX.Element {
  const repository = useProjectRepository(project.id)

  if (repository.isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading repository status…</Card>
  }

  if (repository.isError || !repository.data) {
    return (
      <Card className="gap-4 p-6">
        <div>
          <h2 className="font-medium">Repository status unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {getRepositoryErrorMessage(repository.error)}
          </p>
        </div>
        <Button variant="outline" className="w-fit gap-2" onClick={() => void repository.refetch()}>
          <ArrowClockwise className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </Card>
    )
  }

  return (
    <Card className="gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <GithubLogo className="size-5" aria-hidden="true" />
          <div>
            <h2 className="font-medium">{repository.data.fullName}</h2>
            <p className="text-xs text-muted-foreground">
              {repository.data.isPrivate ? 'Private' : 'Public'} · Default branch{' '}
              {repository.data.defaultBranch}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            render={<a href={repository.data.htmlUrl} target="_blank" rel="noreferrer" />}
            variant="outline"
            className="gap-2"
          >
            <ArrowSquareOut className="size-4" aria-hidden="true" />
            Open on GitHub
          </Button>
          <Button variant="ghost" className="gap-2" onClick={() => void repository.refetch()}>
            <ArrowClockwise className="size-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Live from GitHub. Space Zero does not store repository API responses in its local database.
      </p>
    </Card>
  )
}

function GitHubWorkflowGate({
  project,
  connectionLoading,
  connected,
  onShowOverview,
  children
}: {
  project: Project
  connectionLoading: boolean
  connected: boolean
  onShowOverview: () => void
  children: ReactNode
}): React.JSX.Element {
  if (connectionLoading) {
    return (
      <Card className="p-6" role="status">
        <p className="text-sm text-muted-foreground">Loading GitHub connection…</p>
      </Card>
    )
  }
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
