import { ArrowLeft } from '@phosphor-icons/react'

import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import type {
  GitHubCheckRun,
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubPullRequestReview,
  GitHubPullRequestSummary
} from '../../shared'
import { GitHubMarkdown } from './github-markdown'
import {
  DetailPlaceholder,
  ErrorState,
  ListHeader,
  ListPlaceholders,
  RefreshButton
} from './issues-screen'

export type PullRequestListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      items: GitHubPullRequestSummary[]
      page: number
      hasNextPage: boolean
    }

export function PullRequestListScreen({
  state,
  fetching,
  onRefresh,
  onRetry,
  onPageChange,
  onOpenPullRequest
}: {
  state: PullRequestListState
  fetching: boolean
  onRefresh: () => void
  onRetry: () => void
  onPageChange: (page: number) => void
  onOpenPullRequest: (number: number) => void
}): React.JSX.Element {
  return (
    <section className="space-y-4" aria-label="GitHub Pull Requests">
      <ListHeader
        title="Pull Requests"
        description={
          state.status === 'error'
            ? 'GitHub data is unavailable; previously loaded Pull Requests are hidden.'
            : 'Live from the linked GitHub repository.'
        }
        fetching={fetching}
        onRefresh={onRefresh}
      />
      {state.status === 'loading' ? (
        <ListPlaceholders label="Loading Pull Requests…" itemLabel="Pull Request placeholder" />
      ) : null}
      {state.status === 'error' ? <ErrorState message={state.message} onRetry={onRetry} /> : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No Pull Requests were found in this repository.
        </p>
      ) : null}
      {state.status === 'ready' && state.items.length > 0 ? (
        <ul className="divide-y rounded-lg border" aria-label="Pull Request list">
          {state.items.map((pullRequest) => (
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
      {state.status === 'ready' ? (
        <nav className="flex items-center justify-between" aria-label="Pull Request pages">
          <Button variant="outline" size="sm" disabled={state.page === 1 || fetching} onClick={() => onPageChange(state.page - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {state.page}</span>
          <Button variant="outline" size="sm" disabled={!state.hasNextPage || fetching} onClick={() => onPageChange(state.page + 1)}>Next</Button>
        </nav>
      ) : null}
    </section>
  )
}

export type PullRequestDetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pullRequest: GitHubPullRequest }

type ConversationState =
  | { status: 'loading' }
  | { status: 'error'; message: string; items: GitHubIssueComment[] }
  | { status: 'ready'; items: GitHubIssueComment[]; hasNextPage: boolean }

type ChecksState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: GitHubCheckRun[] }

type ReviewsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: GitHubPullRequestReview[] }

export function PullRequestDetailScreen({
  number,
  state,
  comments,
  checks,
  reviews,
  fetching,
  onBack,
  onRefresh,
  onRetry,
  onRetryComments,
  onLoadMoreComments,
  reviewSections
}: {
  number: number
  state: PullRequestDetailState
  comments: ConversationState
  checks?: ChecksState
  reviews?: ReviewsState
  fetching: boolean
  onBack: () => void
  onRefresh: () => void
  onRetry: () => void
  onRetryComments: () => void
  onLoadMoreComments: () => void
  reviewSections?: React.ReactNode
}): React.JSX.Element {
  const commentItems = comments.status === 'loading' ? [] : comments.items
  return (
    <section className="space-y-5" aria-label={`Pull Request #${number}`}>
      <header className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Pull Requests
        </Button>
        <RefreshButton fetching={fetching} onRefresh={onRefresh} />
      </header>
      {state.status === 'loading' ? <DetailPlaceholder label="Loading Pull Request…" /> : null}
      {state.status === 'error' ? <ErrorState message={state.message} onRetry={onRetry} /> : null}
      {state.status === 'ready' ? (
        <>
          <PullRequestContent pullRequest={state.pullRequest} />
          {reviewSections}
          {checks ? <ChecksSection state={checks} /> : null}
          {reviews ? <ReviewsSection state={reviews} /> : null}
          <section className="space-y-3" aria-label="Pull Request conversation">
            <div>
              <h3 className="font-semibold">Conversation</h3>
              <p className="text-xs text-muted-foreground">{state.pullRequest.conversationCommentCount} comments</p>
            </div>
            {comments.status === 'loading' ? <ListPlaceholders label="Loading conversation…" itemLabel="Conversation placeholder" /> : null}
            {comments.status === 'error' ? <ErrorState message={comments.message} onRetry={onRetryComments} /> : null}
            {comments.status === 'ready' && commentItems.length === 0 ? <p className="text-sm text-muted-foreground">No conversation comments yet.</p> : null}
            {commentItems.map((comment) => <CommentCard key={comment.id} comment={comment} />)}
            {comments.status === 'ready' && comments.hasNextPage ? (
              <Button variant="outline" size="sm" disabled={fetching} onClick={onLoadMoreComments}>{fetching ? 'Loading more…' : 'Load more'}</Button>
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  )
}

function ChecksSection({ state }: { state: ChecksState }): React.JSX.Element {
  return (
    <section className="space-y-3" aria-label="Pull Request checks">
      <h3 className="font-semibold">Checks</h3>
      {state.status === 'loading' ? <p className="text-sm text-muted-foreground" role="status">Loading checks…</p> : null}
      {state.status === 'error' ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}
      {state.status === 'ready' && state.items.length === 0 ? <p className="text-sm text-muted-foreground">No checks were reported.</p> : null}
      {state.status === 'ready' ? state.items.map((check) => (
        <article key={check.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div><p className="text-sm font-medium">{check.name}</p><p className="text-xs text-muted-foreground">{check.appName ?? 'GitHub'}</p></div>
          <Badge variant={check.conclusion === 'success' ? 'default' : 'secondary'}>{check.conclusion ?? check.status}</Badge>
        </article>
      )) : null}
    </section>
  )
}

function ReviewsSection({ state }: { state: ReviewsState }): React.JSX.Element {
  return (
    <section className="space-y-3" aria-label="Pull Request reviews">
      <h3 className="font-semibold">Reviews</h3>
      {state.status === 'loading' ? <p className="text-sm text-muted-foreground" role="status">Loading reviews…</p> : null}
      {state.status === 'error' ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}
      {state.status === 'ready' && state.items.length === 0 ? <p className="text-sm text-muted-foreground">No submitted reviews yet.</p> : null}
      {state.status === 'ready' ? state.items.map((review) => (
        <article key={review.id} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center gap-2"><span className="text-sm font-medium">{review.author?.login ?? 'ghost'}</span><Badge variant="outline">{review.state.replace('_', ' ')}</Badge></div>
          {review.body ? <GitHubMarkdown markdown={review.body} /> : <p className="text-sm text-muted-foreground">No review summary.</p>}
        </article>
      )) : null}
    </section>
  )
}

function PullRequestContent({ pullRequest }: { pullRequest: GitHubPullRequest }): React.JSX.Element {
  return (
    <article className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{pullRequest.title}</h2><PullRequestState state={pullRequest.state} />{pullRequest.isDraft ? <Badge variant="outline">draft</Badge> : null}</div>
        <p className="text-xs text-muted-foreground">#{pullRequest.number} by {pullRequest.author?.login ?? 'ghost'} · Updated {formatDate(pullRequest.updatedAt)}</p>
      </div>
      <div className="rounded-lg border p-4"><GitHubMarkdown markdown={pullRequest.body} /></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Branches</dt><dd className="mt-1 font-mono text-xs">{pullRequest.headBranch} → {pullRequest.baseBranch}</dd></div>
        <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Commits</dt><dd className="mt-1 font-medium">{pullRequest.commitCount}</dd></div>
      </dl>
    </article>
  )
}

function CommentCard({ comment }: { comment: GitHubIssueComment }): React.JSX.Element {
  return <article className="space-y-2 rounded-lg border p-4"><p className="text-xs text-muted-foreground">{comment.author?.login ?? 'ghost'} · {formatDate(comment.createdAt)}</p><GitHubMarkdown markdown={comment.body || 'No comment body.'} /></article>
}

function PullRequestState({ state }: { state: GitHubPullRequestSummary['state'] }): React.JSX.Element {
  return <Badge variant={state === 'open' ? 'default' : 'secondary'}>{state}</Badge>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
