import { ArrowLeft, ArrowClockwise } from '@phosphor-icons/react'
import { useState } from 'react'

import { Badge } from '../../../../renderer/src/components/ui/badge'
import { Button } from '../../../../renderer/src/components/ui/button'
import type { Project } from '../../../projects/shared'
import type { GitHubIssue, GitHubIssueComment } from '../../shared'
import {
  useProjectIssue,
  useProjectIssueComments,
  useProjectIssues
} from '../hooks/use-project-issues'

export function IssuesView({ project }: { project: Project }): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null)

  if (selectedIssue !== null) {
    return (
      <IssueDetail
        projectId={project.id}
        number={selectedIssue}
        onBack={() => setSelectedIssue(null)}
      />
    )
  }

  return (
    <IssueList
      projectId={project.id}
      page={page}
      onPageChange={setPage}
      onOpenIssue={setSelectedIssue}
    />
  )
}

function IssueList({
  projectId,
  page,
  onPageChange,
  onOpenIssue
}: {
  projectId: string
  page: number
  onPageChange: (page: number) => void
  onOpenIssue: (number: number) => void
}): React.JSX.Element {
  const query = useProjectIssues(projectId, page)

  return (
    <section className="space-y-4" aria-label="GitHub Issues">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Issues</h2>
          <p className="text-sm text-muted-foreground">Live from the linked GitHub repository.</p>
        </div>
        <RefreshButton fetching={query.isFetching} onRefresh={() => void query.refetch()} />
      </header>

      {query.isPending ? <LoadingState label="Loading Issues…" /> : null}
      {query.isError ? (
        <ErrorState
          message="Could not load Issues. Check repository access and try again."
          onRetry={query.refetch}
        />
      ) : null}
      {query.data?.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No Issues were found in this repository.
        </p>
      ) : null}
      {query.data?.items.length ? (
        <ul className="divide-y rounded-lg border" aria-label="Issue list">
          {query.data.items.map((issue) => (
            <li key={issue.number}>
              <button
                type="button"
                className="w-full space-y-2 p-4 text-left transition-colors hover:bg-muted/50"
                onClick={() => onOpenIssue(issue.number)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{issue.title}</span>
                  <IssueState state={issue.state} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>#{issue.number}</span>
                  <span>opened by {issue.author?.login ?? 'ghost'}</span>
                  <span>{issue.commentCount} comments</span>
                  {issue.labels.map((label) => (
                    <Badge key={label.id} variant="outline">
                      {label.name}
                    </Badge>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {query.data ? (
        <nav className="flex items-center justify-between" aria-label="Issue pages">
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

function IssueDetail({
  projectId,
  number,
  onBack
}: {
  projectId: string
  number: number
  onBack: () => void
}): React.JSX.Element {
  const [commentsPage, setCommentsPage] = useState(1)
  const issueQuery = useProjectIssue(projectId, number)
  const commentsQuery = useProjectIssueComments(projectId, number, commentsPage)
  const refresh = (): void => {
    void issueQuery.refetch()
    void commentsQuery.refetch()
  }

  return (
    <section className="space-y-5" aria-label={`Issue #${number}`}>
      <header className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Issues
        </Button>
        <RefreshButton
          fetching={issueQuery.isFetching || commentsQuery.isFetching}
          onRefresh={refresh}
        />
      </header>

      {issueQuery.isPending ? <LoadingState label="Loading Issue…" /> : null}
      {issueQuery.isError ? (
        <ErrorState message="Could not load this Issue. Try again." onRetry={issueQuery.refetch} />
      ) : null}
      {issueQuery.data ? <IssueContent issue={issueQuery.data} /> : null}

      {issueQuery.data ? (
        <section className="space-y-3" aria-label="Issue comments">
          <h3 className="font-semibold">Comments</h3>
          {commentsQuery.isPending ? <LoadingState label="Loading comments…" /> : null}
          {commentsQuery.isError ? (
            <ErrorState
              message="Could not load comments. Try again."
              onRetry={commentsQuery.refetch}
            />
          ) : null}
          {commentsQuery.data?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : null}
          {commentsQuery.data?.items.map((comment) => (
            <IssueCommentCard key={comment.id} comment={comment} />
          ))}
          {commentsQuery.data ? (
            <nav className="flex items-center justify-between" aria-label="Comment pages">
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

function IssueContent({ issue }: { issue: GitHubIssue }): React.JSX.Element {
  return (
    <article className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{issue.title}</h2>
          <IssueState state={issue.state} />
        </div>
        <p className="text-xs text-muted-foreground">
          #{issue.number} opened by {issue.author?.login ?? 'ghost'} · Updated{' '}
          {formatDate(issue.updatedAt)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {issue.labels.map((label) => (
          <Badge key={label.id} variant="outline">
            {label.name}
          </Badge>
        ))}
      </div>
      <div className="rounded-lg border p-4">
        <p className="whitespace-pre-wrap text-sm">{issue.body || 'No description provided.'}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Assignees: {issue.assignees.map((assignee) => assignee.login).join(', ') || 'None'}
      </p>
    </article>
  )
}

function IssueCommentCard({ comment }: { comment: GitHubIssueComment }): React.JSX.Element {
  return (
    <article className="space-y-2 rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">
        {comment.author?.login ?? 'ghost'} · {formatDate(comment.createdAt)}
      </p>
      <p className="whitespace-pre-wrap text-sm">{comment.body || 'No comment body.'}</p>
    </article>
  )
}

function IssueState({ state }: { state: GitHubIssue['state'] }): React.JSX.Element {
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
