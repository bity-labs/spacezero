import { ArrowClockwise, ArrowLeft } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Badge } from '../../../../renderer/src/components/ui/badge'
import { Button } from '../../../../renderer/src/components/ui/button'
import type { Project } from '../../../projects/shared'
import type { GitHubIssueComment, GitHubPullRequest } from '../../shared'
import { githubReadErrorMessage } from '../github-error-messages'
import { PullRequestActions } from './pull-request-actions'
import { PullRequestReviewSections } from './pull-request-review-sections'
import {
  useProjectPullRequest,
  useProjectPullRequestComments,
  useProjectPullRequests
} from '../hooks/use-project-pull-requests'

export function PullRequestsView({ project }: { project: Project }): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [selectedPullRequest, setSelectedPullRequest] = useState<number | null>(null)

  if (selectedPullRequest !== null) {
    return (
      <PullRequestDetail
        projectId={project.id}
        number={selectedPullRequest}
        onBack={() => setSelectedPullRequest(null)}
      />
    )
  }

  return (
    <PullRequestList
      projectId={project.id}
      page={page}
      onPageChange={setPage}
      onOpenPullRequest={setSelectedPullRequest}
    />
  )
}

function PullRequestList({
  projectId,
  page,
  onPageChange,
  onOpenPullRequest
}: {
  projectId: string
  page: number
  onPageChange: (page: number) => void
  onOpenPullRequest: (number: number) => void
}): React.JSX.Element {
  const query = useProjectPullRequests(projectId, page)

  return (
    <section className="space-y-4" aria-label="GitHub Pull Requests">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pull Requests</h2>
          <p className="text-sm text-muted-foreground">Live from the linked GitHub repository.</p>
        </div>
        <RefreshButton fetching={query.isFetching} onRefresh={() => void query.refetch()} />
      </header>

      {query.isPending ? <LoadingState label="Loading Pull Requests…" /> : null}
      {query.isError ? (
        <ErrorState
          message={githubReadErrorMessage(query.error, 'Pull Requests')}
          onRetry={query.refetch}
        />
      ) : null}
      {query.data?.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No Pull Requests were found in this repository.
        </p>
      ) : null}
      {query.data?.items.length ? (
        <ul className="divide-y rounded-lg border" aria-label="Pull Request list">
          {query.data.items.map((pullRequest) => (
            <li key={pullRequest.number}>
              <button
                type="button"
                className="w-full space-y-2 p-4 text-left transition-colors hover:bg-muted/50"
                onClick={() => onOpenPullRequest(pullRequest.number)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{pullRequest.title}</span>
                  <PullRequestState state={pullRequest.state} />
                  {pullRequest.isDraft ? <Badge variant="outline">draft</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  #{pullRequest.number} by {pullRequest.author?.login ?? 'ghost'} ·{' '}
                  {pullRequest.headBranch} → {pullRequest.baseBranch}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {query.data ? (
        <nav className="flex items-center justify-between" aria-label="Pull Request pages">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1 || query.isFetching}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!query.data.hasNextPage || query.isFetching}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </section>
  )
}

function PullRequestDetail({
  projectId,
  number,
  onBack
}: {
  projectId: string
  number: number
  onBack: () => void
}): React.JSX.Element {
  const [commentsPage, setCommentsPage] = useState(1)
  const queryClient = useQueryClient()
  const pullRequestQuery = useProjectPullRequest(projectId, number)
  const commentsQuery = useProjectPullRequestComments(projectId, number, commentsPage)
  const refresh = (): void => {
    void Promise.all([
      pullRequestQuery.refetch(),
      commentsQuery.refetch(),
      queryClient.refetchQueries({
        queryKey: ['github', 'pull-request-files', projectId, number]
      }),
      queryClient.refetchQueries({
        queryKey: ['github', 'pull-request-check-runs', projectId, number]
      }),
      queryClient.refetchQueries({
        queryKey: ['github', 'pull-request-commit-statuses', projectId, number]
      }),
      queryClient.refetchQueries({
        queryKey: ['github', 'pull-request-reviews', projectId, number]
      })
    ])
  }

  return (
    <section className="space-y-5" aria-label={`Pull Request #${number}`}>
      <header className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Pull Requests
        </Button>
        <RefreshButton
          fetching={pullRequestQuery.isFetching || commentsQuery.isFetching}
          onRefresh={refresh}
        />
      </header>

      {pullRequestQuery.isPending ? <LoadingState label="Loading Pull Request…" /> : null}
      {pullRequestQuery.isError ? (
        <ErrorState
          message={githubReadErrorMessage(pullRequestQuery.error, 'Pull Request')}
          onRetry={pullRequestQuery.refetch}
        />
      ) : null}
      {pullRequestQuery.data ? <PullRequestContent pullRequest={pullRequestQuery.data} /> : null}

      {pullRequestQuery.data ? <PullRequestActions projectId={projectId} number={number} /> : null}

      {pullRequestQuery.data ? (
        <PullRequestReviewSections projectId={projectId} number={number} />
      ) : null}

      {pullRequestQuery.data ? (
        <section className="space-y-3" aria-label="Pull Request conversation">
          <div>
            <h3 className="font-semibold">Conversation</h3>
            <p className="text-xs text-muted-foreground">
              {pullRequestQuery.data.conversationCommentCount} comments
            </p>
          </div>
          {commentsQuery.isPending ? <LoadingState label="Loading conversation…" /> : null}
          {commentsQuery.isError ? (
            <ErrorState
              message={githubReadErrorMessage(commentsQuery.error, 'Pull Request conversation')}
              onRetry={commentsQuery.refetch}
            />
          ) : null}
          {commentsQuery.data?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversation comments yet.</p>
          ) : null}
          {commentsQuery.data?.items.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
          {commentsQuery.data ? (
            <nav className="flex items-center justify-between" aria-label="Conversation pages">
              <Button
                variant="outline"
                size="sm"
                disabled={commentsPage === 1 || commentsQuery.isFetching}
                onClick={() => setCommentsPage((current) => current - 1)}
              >
                Previous comments
              </Button>
              <span className="text-xs text-muted-foreground">Page {commentsPage}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!commentsQuery.data.hasNextPage || commentsQuery.isFetching}
                onClick={() => setCommentsPage((current) => current + 1)}
              >
                Next comments
              </Button>
            </nav>
          ) : null}
        </section>
      ) : null}
    </section>
  )
}

function PullRequestContent({
  pullRequest
}: {
  pullRequest: GitHubPullRequest
}): React.JSX.Element {
  return (
    <article className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{pullRequest.title}</h2>
          <PullRequestState state={pullRequest.state} />
          {pullRequest.isDraft ? <Badge variant="outline">draft</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          #{pullRequest.number} by {pullRequest.author?.login ?? 'ghost'} · Updated{' '}
          {formatDate(pullRequest.updatedAt)}
        </p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="whitespace-pre-wrap text-sm">
          {pullRequest.body || 'No description provided.'}
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <dt className="text-xs text-muted-foreground">Branches</dt>
          <dd className="mt-1 font-mono text-xs">
            {pullRequest.headBranch} → {pullRequest.baseBranch}
          </dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="text-xs text-muted-foreground">Commits</dt>
          <dd className="mt-1 font-medium">{pullRequest.commitCount}</dd>
        </div>
      </dl>
    </article>
  )
}

function CommentCard({ comment }: { comment: GitHubIssueComment }): React.JSX.Element {
  return (
    <article className="space-y-2 rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">
        {comment.author?.login ?? 'ghost'} · {formatDate(comment.createdAt)}
      </p>
      <p className="whitespace-pre-wrap text-sm">{comment.body || 'No comment body.'}</p>
    </article>
  )
}

function PullRequestState({ state }: { state: GitHubPullRequest['state'] }): React.JSX.Element {
  return <Badge variant={state === 'open' ? 'default' : 'secondary'}>{state}</Badge>
}

function RefreshButton({
  fetching,
  onRefresh
}: {
  fetching: boolean
  onRefresh: () => void
}): React.JSX.Element {
  return (
    <Button variant="outline" size="sm" disabled={fetching} onClick={onRefresh}>
      <ArrowClockwise className={fetching ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
      Refresh
    </Button>
  )
}

function LoadingState({ label }: { label: string }): React.JSX.Element {
  return (
    <p className="rounded-lg border p-4 text-sm text-muted-foreground" role="status">
      {label}
    </p>
  )
}

function ErrorState({
  message,
  onRetry
}: {
  message: string
  onRetry: () => unknown
}): React.JSX.Element {
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-4" role="alert">
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={() => void onRetry()}>
        Retry
      </Button>
    </div>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}
