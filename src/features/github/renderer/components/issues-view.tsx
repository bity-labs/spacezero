import { ArrowLeft, ArrowClockwise } from '@phosphor-icons/react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Badge } from '../../../../renderer/src/components/ui/badge'
import { Button } from '../../../../renderer/src/components/ui/button'
import type { Project } from '../../../projects/shared'
import type { ProjectSession } from '../../../sessions/shared'
import type { GitHubIssue, GitHubIssueComment } from '../../shared'
import { githubMutationErrorMessage, githubReadErrorMessage } from '../github-error-messages'
import { GitHubMarkdown } from './github-markdown'
import { useProjectIssue, useProjectIssues } from '../hooks/use-project-issues'

export function IssuesViewLoading(): React.JSX.Element {
  return (
    <section className="space-y-4" aria-label="GitHub Issues">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Issues</h2>
          <p className="text-sm text-muted-foreground">Live from the linked GitHub repository.</p>
        </div>
        <RefreshButton fetching onRefresh={() => undefined} />
      </header>
      <ListPlaceholders label="Loading Issues…" itemLabel="Issue placeholder" />
    </section>
  )
}

export function IssuesView({
  project,
  initialIssueNumber = null,
  onSessionCreated
}: {
  project: Project
  initialIssueNumber?: number | null
  onSessionCreated?: (session: ProjectSession) => void
}): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [selectedIssue, setSelectedIssue] = useState<number | null>(initialIssueNumber)

  if (selectedIssue !== null) {
    return (
      <IssueDetail
        projectId={project.id}
        number={selectedIssue}
        onBack={() => setSelectedIssue(null)}
        onSessionCreated={onSessionCreated}
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
  const issues = query.isError ? undefined : query.data

  return (
    <section className="space-y-4" aria-label="GitHub Issues">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Issues</h2>
          <p className="text-sm text-muted-foreground">
            {query.isError
              ? 'GitHub data is unavailable; previously loaded Issues are hidden.'
              : 'Live from the linked GitHub repository.'}
          </p>
        </div>
        <RefreshButton fetching={query.isFetching} onRefresh={() => void query.refetch()} />
      </header>

      {query.isPending ? (
        <ListPlaceholders label="Loading Issues…" itemLabel="Issue placeholder" />
      ) : null}
      {query.isError ? (
        <ErrorState
          message={githubReadErrorMessage(query.error, 'Issues')}
          onRetry={query.refetch}
        />
      ) : null}
      {issues?.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No Issues were found in this repository.
        </p>
      ) : null}
      {issues?.items.length ? (
        <ul className="divide-y rounded-lg border" aria-label="Issue list">
          {issues.items.map((issue) => (
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

      {issues ? (
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
            disabled={!issues.hasNextPage || query.isFetching}
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
  onBack,
  onSessionCreated
}: {
  projectId: string
  number: number
  onBack: () => void
  onSessionCreated?: (session: ProjectSession) => void
}): React.JSX.Element {
  const [commentsPage, setCommentsPage] = useState(1)
  const [commentBody, setCommentBody] = useState('')
  const [commentValidationError, setCommentValidationError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [startSessionError, setStartSessionError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const issueQuery = useProjectIssue(projectId, number)
  const commentQueries = useQueries({
    queries: Array.from({ length: commentsPage }, (_, index) => {
      const page = index + 1
      return {
        queryKey: ['github', 'issue-comments', projectId, number, page, 20],
        queryFn: () =>
          window.spacezero.github.listIssueComments({ projectId, number, page, perPage: 20 }),
        refetchOnMount: 'always' as const,
        refetchOnWindowFocus: 'always' as const
      }
    })
  })
  const issue = issueQuery.isError ? undefined : issueQuery.data
  const loadedComments = uniqueComments(
    commentQueries.flatMap((query) => (query.isError || !query.data ? [] : query.data.items))
  )
  const lastCommentsPage = commentQueries.at(-1)?.data
  const commentsPending = commentQueries.some((query) => query.isPending)
  const commentsFetching = commentQueries.some((query) => query.isFetching)
  const commentsError = commentQueries.find((query) => query.isError)?.error
  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      window.spacezero.github.createIssueComment({ projectId, number, body }),
    onSuccess: async () => {
      setCommentBody('')
      setSuccessMessage('Comment added.')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['github', 'issue-comments', projectId, number]
        }),
        queryClient.invalidateQueries({ queryKey: ['github', 'issue', projectId, number] }),
        queryClient.invalidateQueries({ queryKey: ['github', 'issues', projectId] })
      ])
    }
  })
  const stateMutation = useMutation({
    mutationFn: (state: GitHubIssue['state']) =>
      window.spacezero.github.updateIssueState({ projectId, number, state }),
    onSuccess: async (issue) => {
      setSuccessMessage(issue.state === 'closed' ? 'Issue closed.' : 'Issue reopened.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['github', 'issue', projectId, number] }),
        queryClient.invalidateQueries({ queryKey: ['github', 'issues', projectId] })
      ])
    }
  })
  const submitComment = (): void => {
    const body = commentBody.trim()
    setSuccessMessage(null)
    commentMutation.reset()
    if (!body) {
      setCommentValidationError('Enter a comment before submitting.')
      return
    }
    setCommentValidationError(null)
    commentMutation.mutate(body)
  }
  const refresh = (): void => {
    void issueQuery.refetch()
    void Promise.all(commentQueries.map((query) => query.refetch()))
  }

  return (
    <section className="space-y-5" aria-label={`Issue #${number}`}>
      <header className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Issues
        </Button>
        <RefreshButton fetching={issueQuery.isFetching || commentsFetching} onRefresh={refresh} />
      </header>

      {issueQuery.isPending ? <DetailPlaceholder label="Loading Issue…" /> : null}
      {issueQuery.isError ? (
        <ErrorState
          message={githubReadErrorMessage(issueQuery.error, 'Issue')}
          onRetry={issueQuery.refetch}
        />
      ) : null}
      {issue ? (
        <>
          <IssueContent issue={issue} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isStartingSession}
              onClick={() => {
                setIsStartingSession(true)
                setStartSessionError(null)
                void window.spacezero.github
                  .startIssueSession({ projectId, number })
                  .then((session) => onSessionCreated?.(session))
                  .catch(() => {
                    setStartSessionError(
                      'Could not create an isolated Session for this Issue. The Project was not changed.'
                    )
                  })
                  .finally(() => setIsStartingSession(false))
              }}
            >
              {isStartingSession ? 'Starting Session…' : 'Start Session from Issue'}
            </Button>
            <Button
              variant="outline"
              disabled={stateMutation.isPending}
              onClick={() => {
                setSuccessMessage(null)
                stateMutation.reset()
                stateMutation.mutate(issue.state === 'open' ? 'closed' : 'open')
              }}
            >
              {stateMutation.isPending
                ? 'Updating Issue…'
                : issue.state === 'open'
                  ? 'Close Issue'
                  : 'Reopen Issue'}
            </Button>
            {successMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {successMessage}
              </p>
            ) : null}
            {stateMutation.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {githubMutationErrorMessage(stateMutation.error)}
              </p>
            ) : null}
            {startSessionError ? (
              <p className="text-sm text-destructive" role="alert">
                {startSessionError}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {issue ? (
        <section className="space-y-3" aria-label="Issue comments">
          <h3 className="font-semibold">Comments</h3>
          {commentsPending && loadedComments.length === 0 ? (
            <ListPlaceholders label="Loading comments…" itemLabel="Comment placeholder" />
          ) : null}
          {commentsError ? (
            <ErrorState
              message={githubReadErrorMessage(commentsError, 'comments')}
              onRetry={() => Promise.all(commentQueries.map((query) => query.refetch()))}
            />
          ) : null}
          {lastCommentsPage?.items.length === 0 && loadedComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : null}
          {loadedComments.map((comment) => (
            <IssueCommentCard key={comment.id} comment={comment} />
          ))}
          {lastCommentsPage?.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={commentsFetching}
              onClick={() => setCommentsPage((current) => current + 1)}
            >
              {commentsFetching ? 'Loading more…' : 'Load more'}
            </Button>
          ) : null}
          <form
            className="space-y-2 rounded-lg border p-4"
            onSubmit={(event) => {
              event.preventDefault()
              submitComment()
            }}
          >
            <label className="text-sm font-medium" htmlFor={`issue-${number}-comment`}>
              Add a comment
            </label>
            <textarea
              id={`issue-${number}-comment`}
              className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm"
              value={commentBody}
              maxLength={65_536}
              disabled={commentMutation.isPending}
              onChange={(event) => {
                setCommentBody(event.target.value)
                setCommentValidationError(null)
                setSuccessMessage(null)
              }}
            />
            {commentValidationError ? (
              <p className="text-sm text-destructive" role="alert">
                {commentValidationError}
              </p>
            ) : null}
            {commentMutation.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {githubMutationErrorMessage(commentMutation.error)}
              </p>
            ) : null}
            <Button type="submit" disabled={commentMutation.isPending}>
              {commentMutation.isPending ? 'Adding comment…' : 'Add comment'}
            </Button>
          </form>
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
        <GitHubMarkdown markdown={issue.body} />
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
      <GitHubMarkdown markdown={comment.body || 'No comment body.'} />
    </article>
  )
}

function uniqueComments(comments: GitHubIssueComment[]): GitHubIssueComment[] {
  const seen = new Set<string>()
  return comments.filter((comment) => {
    if (seen.has(comment.id)) return false
    seen.add(comment.id)
    return true
  })
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

function ListPlaceholders({
  label,
  itemLabel
}: {
  label: string
  itemLabel: string
}): React.JSX.Element {
  return (
    <div className="space-y-2" role="status" aria-label={label}>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-4" aria-label={itemLabel}>
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function DetailPlaceholder({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="space-y-4" role="status" aria-label={label}>
      <div className="space-y-2 rounded-lg border p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2 rounded-lg border p-4">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2 rounded-lg border p-4">
        <div className="h-4 w-36 animate-pulse rounded bg-muted" />
        <div className="h-16 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
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
