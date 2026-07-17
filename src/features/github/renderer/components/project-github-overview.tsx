import { ArrowClockwise } from '@phosphor-icons/react'

import { Badge } from '../../../../renderer/src/components/ui/badge'
import { Button } from '../../../../renderer/src/components/ui/button'
import { Card } from '../../../../renderer/src/components/ui/card'
import type { Project } from '../../../projects/shared'
import type { GitHubIssue, GitHubPullRequestSummary } from '../../shared'
import { githubReadErrorMessage } from '../github-error-messages'
import { useProjectIssues } from '../hooks/use-project-issues'
import { useProjectPullRequests } from '../hooks/use-project-pull-requests'

export function ProjectGitHubOverview({
  project,
  onOpenIssue,
  onViewIssues,
  onOpenPullRequest,
  onViewPullRequests
}: {
  project: Project
  onOpenIssue: (number: number) => void
  onViewIssues: () => void
  onOpenPullRequest: (number: number) => void
  onViewPullRequests: () => void
}): React.JSX.Element {
  const issues = useProjectIssues(project.id, 1)
  const pullRequests = useProjectPullRequests(project.id, 1)
  const refreshing = issues.isFetching || pullRequests.isFetching

  return (
    <Card className="gap-5 p-6" role="region" aria-label="GitHub workflow summary">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">GitHub workflow</h2>
          <p className="text-sm text-muted-foreground">
            Recent open work from the linked repository.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            void issues.refetch()
            void pullRequests.refetch()
          }}
        >
          <ArrowClockwise
            className={refreshing ? 'size-4 animate-spin' : 'size-4'}
            aria-hidden="true"
          />
          Refresh workflows
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SummarySection
          title="Issues"
          loading={issues.isPending}
          error={issues.error}
          emptyMessage="No Issues to show."
          items={featuredIssues(issues.data?.items ?? [])}
          onRetry={() => void issues.refetch()}
          onViewAll={onViewIssues}
          renderItem={(issue) => (
            <SummaryButton
              key={issue.number}
              title={issue.title}
              meta={`#${issue.number} · ${issue.author?.login ?? 'ghost'}`}
              state={issue.state}
              onClick={() => onOpenIssue(issue.number)}
            />
          )}
        />
        <SummarySection
          title="Pull Requests"
          loading={pullRequests.isPending}
          error={pullRequests.error}
          emptyMessage="No Pull Requests to show."
          items={featuredPullRequests(pullRequests.data?.items ?? [])}
          onRetry={() => void pullRequests.refetch()}
          onViewAll={onViewPullRequests}
          renderItem={(pullRequest) => (
            <SummaryButton
              key={pullRequest.number}
              title={pullRequest.title}
              meta={`#${pullRequest.number} · ${pullRequest.author?.login ?? 'ghost'}`}
              state={pullRequest.state}
              onClick={() => onOpenPullRequest(pullRequest.number)}
            />
          )}
        />
      </div>
    </Card>
  )
}

function SummarySection<T>({
  title,
  loading,
  error,
  emptyMessage,
  items,
  onRetry,
  onViewAll,
  renderItem
}: {
  title: string
  loading: boolean
  error: unknown
  emptyMessage: string
  items: T[]
  onRetry: () => void
  onViewAll: () => void
  renderItem: (item: T) => React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-3" aria-label={`${title} summary`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          View all {title}
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading {title}…
        </p>
      ) : null}
      {error ? (
        <div className="space-y-2 rounded-lg border border-destructive/40 p-3" role="alert">
          <p className="text-sm">{githubReadErrorMessage(error, title)}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry {title}
          </Button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : null}
      {items.length ? (
        <div className="divide-y rounded-lg border">{items.map(renderItem)}</div>
      ) : null}
    </section>
  )
}

function SummaryButton({
  title,
  meta,
  state,
  onClick
}: {
  title: string
  meta: string
  state: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full items-start justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{meta}</span>
      </span>
      <Badge variant={state === 'open' ? 'default' : 'secondary'}>{state}</Badge>
    </button>
  )
}

function featuredIssues(items: GitHubIssue[]): GitHubIssue[] {
  const open = items.filter((issue) => issue.state === 'open')
  return (open.length ? open : items).slice(0, 3)
}

function featuredPullRequests(items: GitHubPullRequestSummary[]): GitHubPullRequestSummary[] {
  const open = items.filter((pullRequest) => pullRequest.state === 'open')
  return (open.length ? open : items).slice(0, 3)
}
