import { useState } from 'react'
import { GithubLogo, LinkSimple, Plus } from '@phosphor-icons/react'

import type { GitHubProjectLinkOptions } from '../../../github/shared'
import { useGitHubConnection } from '../../../github/renderer'
import type { Project } from '../../shared'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

type ProjectHomeView = 'overview' | 'issues' | 'pull-requests'

export function ProjectHome({
  project,
  onProjectLinked,
  onNewSession
}: {
  project: Project
  onProjectLinked: (project: Project) => void
  onNewSession: () => void
}): React.JSX.Element {
  const [displayProject, setDisplayProject] = useState(project)
  const [view, setView] = useState<ProjectHomeView>('overview')
  const { connection, isLoading: connectionLoading } = useGitHubConnection()
  const [linkOptions, setLinkOptions] = useState<GitHubProjectLinkOptions | null>(null)
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [isSavingLink, setIsSavingLink] = useState(false)

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
          <Button className="gap-2" onClick={onNewSession}>
            <Plus className="size-4" aria-hidden="true" />
            New session
          </Button>
        </div>
        <nav aria-label="Project Home" className="mt-7 flex gap-1">
          <ProjectHomeTab active={view === 'overview'} onClick={() => setView('overview')}>
            Overview
          </ProjectHomeTab>
          <ProjectHomeTab active={view === 'issues'} onClick={() => setView('issues')}>
            Issues
          </ProjectHomeTab>
          <ProjectHomeTab
            active={view === 'pull-requests'}
            onClick={() => setView('pull-requests')}
          >
            Pull Requests
          </ProjectHomeTab>
        </nav>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-5 p-8">
        {view === 'overview' ? (
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
        ) : (
          <ProjectSectionPlaceholder
            title={view === 'issues' ? 'Issues' : 'Pull Requests'}
            project={displayProject}
            connected={connection?.status === 'connected'}
          />
        )}
      </div>
    </div>
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
    return (
      <Card className="gap-3 p-6">
        <div className="flex items-center gap-2">
          <GithubLogo className="size-5" aria-hidden="true" />
          <h2 className="font-medium">{project.githubRepository.fullName}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Linked to this local Project. Git remotes and the Project path were not changed.
        </p>
      </Card>
    )
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

function ProjectSectionPlaceholder({
  title,
  project,
  connected
}: {
  title: string
  project: Project
  connected: boolean
}): React.JSX.Element {
  const action = !connected
    ? 'Connect GitHub'
    : !project.githubRepository
      ? 'Link GitHub repository'
      : null
  return (
    <Card className="gap-2 p-6">
      <h2 className="font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">
        {action ?? `${title} for ${project.githubRepository?.fullName} will appear here.`}
      </p>
    </Card>
  )
}
