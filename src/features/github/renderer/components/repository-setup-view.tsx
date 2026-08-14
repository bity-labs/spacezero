import type { GitHubCloneProgress, GitHubRepositorySetupOption } from '../../shared'
import { AgentResourceTrustCheckbox } from '../../../projects/renderer/components/agent-resource-trust-checkbox'
import { Button, buttonVariants } from '@renderer/components/ui/button'

export type RepositorySetupViewProps = {
  options: GitHubRepositorySetupOption[] | null
  searchQuery: string
  selectedRepositoryId: string | null
  selectedExistingProjectId: string | null
  progress: GitHubCloneProgress | null
  error: string | null
  isStarting: boolean
  agentResourcesTrusted: boolean
  onSearchQueryChange: (query: string) => void
  onSelectRepository: (repositoryId: string) => void
  onSelectExistingProject: (projectId: string) => void
  onAgentResourcesTrustedChange: (trusted: boolean) => void
  onStart: () => void
  onCancel: () => void
  onConfigureAccess: () => void
  renderPrimaryAction?: (primaryAction: React.ReactNode) => React.ReactNode
}

export function RepositorySetupView({
  options,
  searchQuery,
  selectedRepositoryId,
  selectedExistingProjectId,
  progress,
  error,
  isStarting,
  agentResourcesTrusted,
  onSearchQueryChange,
  onSelectRepository,
  onSelectExistingProject,
  onAgentResourcesTrustedChange,
  onStart,
  onCancel,
  onConfigureAccess,
  renderPrimaryAction
}: RepositorySetupViewProps): React.JSX.Element {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredOptions = normalizedSearchQuery
    ? (options ?? []).filter(({ repository }) =>
        [repository.name, repository.fullName].some((value) =>
          value.toLowerCase().includes(normalizedSearchQuery)
        )
      )
    : (options ?? [])
  const selectedOption = filteredOptions.find(
    ({ repository }) => repository.id === selectedRepositoryId
  )
  const matchingProjects = selectedOption?.matchingProjects ?? []
  const cloneRunning = progress?.status === 'starting' || progress?.status === 'cloning'
  const cloneFailed = progress?.status === 'failed' || progress?.status === 'cancelled'
  const busy = isStarting || cloneRunning
  const primaryAction = (
    <Button
      disabled={
        !selectedOption ||
        busy ||
        (matchingProjects.length > 1 && !selectedExistingProjectId)
      }
      onClick={onStart}
    >
      {isStarting
        ? 'Starting…'
        : selectedOption?.existingProject
          ? 'Open Project'
          : matchingProjects.length > 0
            ? 'Link Project'
            : cloneFailed
              ? 'Retry clone'
              : 'Clone repository'}
    </Button>
  )

  return (
    <div className="space-y-4">
      <section className="space-y-2" aria-labelledby="repository-setup-label">
        <h3 id="repository-setup-label" className="text-sm font-medium">
          Choose one repository
        </h3>
        {!options && !error ? (
          <div
            className="space-y-2"
            role="status"
            aria-label="Loading authorized repositories"
            aria-live="polite"
          >
            <RepositoryCardSkeleton />
            <RepositoryCardSkeleton />
            <RepositoryCardSkeleton />
          </div>
        ) : options?.length === 0 ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
            <div>
              <p className="font-medium text-foreground">No accessible repositories</p>
              <p className="mt-1 text-muted-foreground">
                Install or configure the Space Zero GitHub App to grant access to repositories you
                want to clone into Space Zero.
              </p>
            </div>
            <a
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-fit' })}
              href="#/settings?section=account"
              onClick={(event) => {
                event.preventDefault()
                onConfigureAccess()
              }}
            >
              Configure GitHub repository access
            </a>
          </div>
        ) : options ? (
          <>
            <label className="sr-only" htmlFor="repository-search">
              Search repositories
            </label>
            <input
              id="repository-search"
              type="search"
              value={searchQuery}
              placeholder="Search repositories"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
            {filteredOptions.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm">
                <p className="font-medium text-foreground">No matching repositories</p>
                <p className="mt-1 text-muted-foreground">
                  Try a different repository name or owner.
                </p>
              </div>
            ) : (
              <fieldset className="max-h-72 space-y-2 overflow-auto pr-1">
                <legend className="sr-only">Authorized repositories</legend>
                {filteredOptions.map((option) => (
                  <RepositoryOptionCard
                    key={option.repository.id}
                    option={option}
                    busy={busy}
                    selected={selectedRepositoryId === option.repository.id}
                    onSelect={() => onSelectRepository(option.repository.id)}
                  />
                ))}
              </fieldset>
            )}
          </>
        ) : null}
      </section>

      {matchingProjects.length > 1 ? (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Choose matching local Project</legend>
          <p className="text-xs text-muted-foreground">
            More than one registered Project has this exact GitHub remote. Choose which one to link;
            Space Zero will not clone a duplicate.
          </p>
          {matchingProjects.map((project) => (
            <label key={project.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="github-existing-project"
                checked={selectedExistingProjectId === project.id}
                disabled={busy}
                onChange={() => onSelectExistingProject(project.id)}
              />
              {project.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      {selectedOption && !selectedOption.existingProject && matchingProjects.length === 0 ? (
        <AgentResourceTrustCheckbox
          checked={agentResourcesTrusted}
          disabled={busy}
          onCheckedChange={onAgentResourcesTrustedChange}
        />
      ) : null}

      {progress ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-muted-foreground">
            {progress.message}
            {progress.percent === undefined ? '' : ` ${progress.percent}%`}
          </p>
          {cloneRunning ? (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel clone
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {renderPrimaryAction ? renderPrimaryAction(primaryAction) : primaryAction}
    </div>
  )
}

function RepositoryCardSkeleton(): React.JSX.Element {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-md border p-3"
      data-testid="repository-card-skeleton"
      aria-hidden="true"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted" />
        </div>
      </div>
      <div className="h-3 w-20 shrink-0 rounded bg-muted" />
    </div>
  )
}

function RepositoryOptionCard({
  option,
  busy,
  selected,
  onSelect
}: {
  option: GitHubRepositorySetupOption
  busy: boolean
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border p-3">
      <span className="flex min-w-0 items-start gap-3">
        <input
          type="radio"
          name="github-project-repository"
          checked={selected}
          disabled={busy}
          onChange={onSelect}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{option.repository.fullName}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {option.repository.isPrivate ? 'Private' : 'Public'} · {option.repository.defaultBranch}
          </span>
        </span>
      </span>
      {option.existingProject ? (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Already added</span>
      ) : option.matchingProjects?.length ? (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {option.matchingProjects.length === 1
            ? 'Local Project match'
            : `${option.matchingProjects.length} local matches`}
        </span>
      ) : null}
    </label>
  )
}
