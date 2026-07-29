import { ArrowClockwise } from '@phosphor-icons/react'

import { Badge } from '../../../../renderer/src/components/ui/badge'
import { Button } from '../../../../renderer/src/components/ui/button'
import { Card } from '../../../../renderer/src/components/ui/card'
import type { Project } from '../../../projects/shared'
import type { GitHubIssue, GitHubPullRequestSummary } from '../../shared'
import { githubReadErrorMessage } from '../github-error-messages'
import { useProjectIssues } from '../hooks/use-project-issues'
import { useProjectPullRequests } from '../hooks/use-project-pull-requests'

export function ProjectGitHubOverviewLoading({
  onViewIssues,
  onViewPullRequests
}: {
  onViewIssues: () => void
  onViewPullRequests: () => void
}): React.JSX.Element {
  return (
    <>
      <SummaryCard
        title="Recent Issues"
        description="Recent open Issues from the linked repository."
        loadingLabel="Loading Recent Issues"
        refreshLabel="Refresh Issues"
        refreshing
        loading
        error={null}
        emptyMessage="No Issues to show."
        items={[]}
        onRetry={() => undefined}
        onRefresh={() => undefined}
        onViewAll={onViewIssues}
        viewAllLabel="View all Issues"
        renderItem={() => null}
      />
      <SummaryCard
        title="Open Pull Requests"
        description="Open Pull Requests from the linked repository."
        loadingLabel="Loading Open Pull Requests"
        refreshLabel="Refresh Pull Requests"
        refreshing
        loading
        error={null}
        emptyMessage="No Pull Requests to show."
        items={[]}
        onRetry={() => undefined}
        onRefresh={() => undefined}
        onViewAll={onViewPullRequests}
        viewAllLabel="View all Pull Requests"
        renderItem={() => null}
      />
    </>
  )
}

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
  return (
    <>
      <SummaryCard
        title="Recent Issues"
        description="Recent open Issues from the linked repository."
        loadingLabel="Loading Recent Issues"
        refreshLabel="Refresh Issues"
        refreshing={issues.isFetching}
        loading={issues.isPending}
        error={issues.error}
        emptyMessage="No Issues to show."
        items={featuredIssues(issues.data?.items ?? [])}
        onRetry={() => void issues.refetch()}
        onRefresh={() => void issues.refetch()}
        onViewAll={onViewIssues}
        viewAllLabel="View all Issues"
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
      <SummaryCard
        title="Open Pull Requests"
        description="Open Pull Requests from the linked repository."
        loadingLabel="Loading Open Pull Requests"
        refreshLabel="Refresh Pull Requests"
        refreshing={pullRequests.isFetching}
        loading={pullRequests.isPending}
        error={pullRequests.error}
        emptyMessage="No Pull Requests to show."
        items={featuredPullRequests(pullRequests.data?.items ?? [])}
        onRetry={() => void pullRequests.refetch()}
        onRefresh={() => void pullRequests.refetch()}
        onViewAll={onViewPullRequests}
        viewAllLabel="View all Pull Requests"
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
    </>
  )
}

function SummaryCard<T>({
  title,
  description,
  loadingLabel,
  refreshLabel,
  refreshing,
  loading,
  error,
  emptyMessage,
  items,
  onRetry,
  onRefresh,
  onViewAll,
  viewAllLabel,
  renderItem
}: {
  title: string
  description: string
  loadingLabel: string
  refreshLabel: string
  refreshing: boolean
  loading: boolean
  error: unknown
  emptyMessage: string
  items: T[]
  onRetry: () => void
  onRefresh: () => void
  onViewAll: () => void
  viewAllLabel: string
  renderItem: (item: T) => React.ReactNode
}): React.JSX.Element {
  return (
    <Card className="gap-5 p-6" role="region" aria-label={title}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={onRefresh}>
          <ArrowClockwise
            className={refreshing ? 'size-4 animate-spin' : 'size-4'}
            aria-hidden="true"
          />
          {refreshLabel}
        </Button>
      </header>
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            {viewAllLabel}
          </Button>
        </div>
        {loading ? <SummaryRowsSkeleton label={loadingLabel} /> : null}
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
        {!loading && !error && items.length ? (
          <div className="divide-y rounded-lg border">{items.map(renderItem)}</div>
        ) : null}
      </div>
    </Card>
  )
}

function SummaryRowsSkeleton({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="divide-y rounded-lg border" role="status" aria-label={label}>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-2 p-3" aria-hidden="true">
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
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
  return items.filter((issue) => issue.state === 'open').slice(0, 3)
}

function featuredPullRequests(items: GitHubPullRequestSummary[]): GitHubPullRequestSummary[] {
  return items.filter((pullRequest) => pullRequest.state === 'open').slice(0, 3)
}
