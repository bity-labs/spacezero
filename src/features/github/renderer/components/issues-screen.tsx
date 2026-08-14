import { ArrowClockwise, ArrowLeft } from '@phosphor-icons/react'

import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import type { GitHubIssue, GitHubIssueComment } from '../../shared'
import { GitHubMarkdown } from './github-markdown'

export type IssueListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: GitHubIssue[]; page: number; hasNextPage: boolean }

export function IssueListScreen({
  state,
  fetching,
  onRefresh,
  onRetry,
  onPageChange,
  onOpenIssue
}: {
  state: IssueListState
  fetching: boolean
  onRefresh: () => void
  onRetry: () => void
  onPageChange: (page: number) => void
  onOpenIssue: (number: number) => void
}): React.JSX.Element {
  return (
    <section className="space-y-4" aria-label="GitHub Issues">
      <ListHeader
        title="Issues"
        description={
          state.status === 'error'
            ? 'GitHub data is unavailable; previously loaded Issues are hidden.'
            : 'Live from the linked GitHub repository.'
        }
        fetching={fetching}
        onRefresh={onRefresh}
      />
      {state.status === 'loading' ? (
        <ListPlaceholders label="Loading Issues…" itemLabel="Issue placeholder" />
      ) : null}
      {state.status === 'error' ? <ErrorState message={state.message} onRetry={onRetry} /> : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No Issues were found in this repository.
        </p>
      ) : null}
      {state.status === 'ready' && state.items.length > 0 ? (
        <ul className="divide-y rounded-lg border" aria-label="Issue list">
          {state.items.map((issue) => (
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
      {state.status === 'ready' ? (
        <nav className="flex items-center justify-between" aria-label="Issue pages">
          <Button
            variant="outline"
            size="sm"
            disabled={state.page === 1 || fetching}
            onClick={() => onPageChange(state.page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {state.page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!state.hasNextPage || fetching}
            onClick={() => onPageChange(state.page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </section>
  )
}

export type IssueDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; issue: GitHubIssue }

export type IssueCommentsState =
  | { status: 'loading' }
  | { status: 'error'; message: string; items: GitHubIssueComment[] }
  | { status: 'ready'; items: GitHubIssueComment[]; hasNextPage: boolean }

export function IssueDetailScreen({
  number,
  state,
  comments,
  fetching,
  isStartingSession,
  startSessionError,
  onBack,
  onRefresh,
  onRetry,
  onRetryComments,
  onLoadMoreComments,
  onStartSession,
  secondaryActions,
  commentComposer
}: {
  number: number
  state: IssueDetailState
  comments: IssueCommentsState
  fetching: boolean
  isStartingSession: boolean
  startSessionError: string | null
  onBack: () => void
  onRefresh: () => void
  onRetry: () => void
  onRetryComments: () => void
  onLoadMoreComments: () => void
  onStartSession?: () => void
  secondaryActions?: React.ReactNode
  commentComposer?: React.ReactNode
}): React.JSX.Element {
  const commentItems = comments.status === 'loading' ? [] : comments.items
  return (
    <section className="space-y-5" aria-label={`Issue #${number}`}>
      <header className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Issues
        </Button>
        <RefreshButton fetching={fetching} onRefresh={onRefresh} />
      </header>
      {state.status === 'loading' ? <DetailPlaceholder label="Loading Issue…" /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} onRetry={onRetry} /> : null}
      {state.status === 'ready' ? (
        <>
          <IssueContent issue={state.issue} />
          {onStartSession || secondaryActions ? (
            <div className="flex flex-wrap items-center gap-3">
              {onStartSession ? (
                <Button disabled={isStartingSession} onClick={onStartSession}>
                  {isStartingSession ? 'Starting Session…' : 'Start Session from Issue'}
                </Button>
              ) : null}
              {secondaryActions}
              {startSessionError ? (
                <p className="text-sm text-destructive" role="alert">
                  {startSessionError}
                </p>
              ) : null}
            </div>
          ) : null}
          <section className="space-y-3" aria-label="Issue comments">
            <h3 className="font-semibold">Comments</h3>
            {comments.status === 'loading' ? (
              <ListPlaceholders label="Loading comments…" itemLabel="Comment placeholder" />
            ) : null}
            {comments.status === 'error' ? (
              <ErrorState message={comments.message} onRetry={onRetryComments} />
            ) : null}
            {comments.status === 'ready' && commentItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : null}
            {commentItems.map((comment) => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
            {comments.status === 'ready' && comments.hasNextPage ? (
              <Button variant="outline" size="sm" disabled={fetching} onClick={onLoadMoreComments}>
                {fetching ? 'Loading more…' : 'Load more'}
              </Button>
            ) : null}
            {commentComposer}
          </section>
        </>
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
          #{issue.number} opened by {issue.author?.login ?? 'ghost'} · Updated {formatDate(issue.updatedAt)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {issue.labels.map((label) => (
          <Badge key={label.id} variant="outline">{label.name}</Badge>
        ))}
      </div>
      <div className="rounded-lg border p-4"><GitHubMarkdown markdown={issue.body} /></div>
      <p className="text-xs text-muted-foreground">
        Assignees: {issue.assignees.map((assignee) => assignee.login).join(', ') || 'None'}
      </p>
    </article>
  )
}

function CommentCard({ comment }: { comment: GitHubIssueComment }): React.JSX.Element {
  return (
    <article className="space-y-2 rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">
        {comment.author?.login ?? 'ghost'} · {formatDate(comment.createdAt)}
      </p>
      <GitHubMarkdown markdown={comment.body || 'No comment body.'} />
    </article>
  )
}

export function ListHeader({ title, description, fetching, onRefresh }: { title: string; description: string; fetching: boolean; onRefresh: () => void }): React.JSX.Element {
  return (
    <header className="flex items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>
      <RefreshButton fetching={fetching} onRefresh={onRefresh} />
    </header>
  )
}

export function RefreshButton({ fetching, onRefresh }: { fetching: boolean; onRefresh: () => void }): React.JSX.Element {
  return (
    <Button variant="outline" size="sm" disabled={fetching} onClick={onRefresh}>
      <ArrowClockwise className={fetching ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
      Refresh
    </Button>
  )
}

export function ListPlaceholders({ label, itemLabel }: { label: string; itemLabel: string }): React.JSX.Element {
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

export function DetailPlaceholder({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="space-y-4" role="status" aria-label={label}>
      {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg border bg-muted/40" />)}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => unknown }): React.JSX.Element {
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-4" role="alert">
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={() => void onRetry()}>Retry</Button>
    </div>
  )
}

function IssueState({ state }: { state: GitHubIssue['state'] }): React.JSX.Element {
  return <Badge variant={state === 'open' ? 'default' : 'secondary'}>{state}</Badge>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
