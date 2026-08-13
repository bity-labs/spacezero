import type { ReactNode } from 'react'
import { ArrowClockwise, ArrowSquareOut, GithubLogo, LinkSimple, Plus } from '@phosphor-icons/react'

import type { GitHubProjectLinkOptions, GitHubRepository } from '../../../github/shared'
import type { Project } from '../../shared'
import { AgentResourceTrustCheckbox } from './agent-resource-trust-checkbox'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

export type ProjectHomeView = 'overview' | 'issues' | 'pull-requests'

export type ProjectHomeGitHubState =
  | { status: 'local-only' }
  | { status: 'loading' }
  | { status: 'disconnected' }
  | {
      status: 'link-needed'
      linkOptions: GitHubProjectLinkOptions | null
      selectedRepositoryId: string | null
      error: string | null
      isLoadingOptions: boolean
      isSavingLink: boolean
    }
  | { status: 'repository-loading' }
  | { status: 'repository-error'; message: string }
  | { status: 'connected'; repository: GitHubRepository }

export type ProjectHomeScreenProps = {
  project: Project
  activeView: ProjectHomeView
  isStartingSession: boolean
  sessionSetupError: string | null
  githubState: ProjectHomeGitHubState
  agentResourceTrust: {
    trusted: boolean
    isSaving: boolean
    error: string | null
  }
  summaryContent: ReactNode
  workflowContent: ReactNode
  onSelectView: (view: ProjectHomeView) => void
  onNewSession: () => void
  onLoadLinkOptions: () => void
  onSelectRepository: (repositoryId: string) => void
  onLinkRepository: () => void
  onRetryRepository: () => void
  onAgentResourceTrustChange: (trusted: boolean) => void
}

export function ProjectHomeScreen({
  project,
  activeView,
  isStartingSession,
  sessionSetupError,
  githubState,
  agentResourceTrust,
  summaryContent,
  workflowContent,
  onSelectView,
  onNewSession,
  onLoadLinkOptions,
  onSelectRepository,
  onLinkRepository,
  onRetryRepository,
  onAgentResourceTrustChange
}: ProjectHomeScreenProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="border-b px-8 pb-0 pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project Home
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
          </div>
          <Button className="gap-2" disabled={isStartingSession} onClick={onNewSession}>
            <Plus className="size-4" aria-hidden="true" />
            {isStartingSession ? 'Starting Session…' : 'New session'}
          </Button>
        </div>
        <nav aria-label="Project Home" className="mt-7 flex gap-1">
          <ProjectHomeTab
            active={activeView === 'overview'}
            onClick={() => onSelectView('overview')}
          >
            Overview
          </ProjectHomeTab>
          <ProjectHomeTab active={activeView === 'issues'} onClick={() => onSelectView('issues')}>
            Issues
          </ProjectHomeTab>
          <ProjectHomeTab
            active={activeView === 'pull-requests'}
            onClick={() => onSelectView('pull-requests')}
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
        {activeView === 'overview' ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <GitHubProjectStateCard
              project={project}
              state={githubState}
              onLoadLinkOptions={onLoadLinkOptions}
              onSelectRepository={onSelectRepository}
              onLinkRepository={onLinkRepository}
              onRetryRepository={onRetryRepository}
            />
            <ProjectAgentResourceTrustCard
              trusted={agentResourceTrust.trusted}
              isSaving={agentResourceTrust.isSaving}
              error={agentResourceTrust.error}
              onChange={onAgentResourceTrustChange}
            />
            {summaryContent}
          </div>
        ) : (
          workflowContent
        )}
      </div>
    </div>
  )
}

function ProjectAgentResourceTrustCard({
  trusted,
  isSaving,
  error,
  onChange
}: {
  trusted: boolean
  isSaving: boolean
  error: string | null
  onChange: (trusted: boolean) => void
}): React.JSX.Element {
  return (
    <Card className="gap-3 p-6" role="region" aria-label="Trust Project">
      <AgentResourceTrustCheckbox
        checked={trusted}
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
  children: ReactNode
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

function GitHubProjectStateCard({
  project,
  state,
  onLoadLinkOptions,
  onSelectRepository,
  onLinkRepository,
  onRetryRepository
}: {
  project: Project
  state: ProjectHomeGitHubState
  onLoadLinkOptions: () => void
  onSelectRepository: (repositoryId: string) => void
  onLinkRepository: () => void
  onRetryRepository: () => void
}): React.JSX.Element {
  if (state.status === 'loading' || state.status === 'repository-loading') {
    return <GitHubRepositoryLoading />
  }

  if (state.status === 'local-only') {
    return (
      <Card className="gap-3 p-6" role="region" aria-label="GitHub repository">
        <div>
          <h2 className="font-medium">Local Project</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This Project uses its local folder and is not linked to a GitHub repository.
          </p>
        </div>
        <p className="rounded-md border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
          {project.path}
        </p>
      </Card>
    )
  }

  if (state.status === 'disconnected') {
    return (
      <Card className="gap-4 p-6" role="region" aria-label="GitHub repository">
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

  if (state.status === 'repository-error') {
    return (
      <Card className="gap-4 p-6" role="region" aria-label="GitHub repository">
        <div>
          <h2 className="font-medium">Repository status unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
        </div>
        <Button variant="outline" className="w-fit gap-2" onClick={onRetryRepository}>
          <ArrowClockwise className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </Card>
    )
  }

  if (state.status === 'connected') {
    return (
      <Card className="gap-4 p-6" role="region" aria-label="GitHub repository">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <GithubLogo className="size-5" aria-hidden="true" />
            <div>
              <h2 className="font-medium">{state.repository.fullName}</h2>
              <p className="text-xs text-muted-foreground">
                {state.repository.isPrivate ? 'Private' : 'Public'} · Default branch{' '}
                {state.repository.defaultBranch}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              render={<a href={state.repository.htmlUrl} target="_blank" rel="noreferrer" />}
              variant="outline"
              className="gap-2"
            >
              <ArrowSquareOut className="size-4" aria-hidden="true" />
              Open on GitHub
            </Button>
            <Button variant="ghost" className="gap-2" onClick={onRetryRepository}>
              <ArrowClockwise className="size-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Live from GitHub. Space Zero does not store repository API responses in its local
          database.
        </p>
      </Card>
    )
  }

  const { linkOptions } = state
  return (
    <Card className="gap-4 p-6" role="region" aria-label="GitHub repository">
      <div>
        <h2 className="font-medium">Link GitHub repository</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Associate this local Project with one authorized repository. Space Zero stores metadata
          only and never changes Git remotes or moves the Project.
        </p>
      </div>

      {!linkOptions ? (
        <Button
          className="w-fit gap-2"
          disabled={state.isLoadingOptions}
          onClick={onLoadLinkOptions}
        >
          <LinkSimple className="size-4" aria-hidden="true" />
          {state.isLoadingOptions ? 'Loading repositories…' : 'Link GitHub repository'}
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
                  checked={state.selectedRepositoryId === repository.id}
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
          <Button
            disabled={!state.selectedRepositoryId || state.isSavingLink}
            onClick={onLinkRepository}
          >
            {state.isSavingLink ? 'Linking…' : 'Link repository'}
          </Button>
        </fieldset>
      )}

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </Card>
  )
}

function GitHubRepositoryLoading(): React.JSX.Element {
  return (
    <Card className="gap-4 p-6" role="region" aria-label="GitHub repository">
      <div className="space-y-3" role="status" aria-label="Loading GitHub repository">
        <div className="h-5 w-2/5 animate-pulse rounded bg-muted" aria-hidden="true" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-muted" aria-hidden="true" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" aria-hidden="true" />
      </div>
    </Card>
  )
}
