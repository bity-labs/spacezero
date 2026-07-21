import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../../../renderer/src/components/ui/button'
import type { GitHubPullRequestReviewCreateRequest } from '../../shared'
import { githubMutationErrorMessage } from '../github-error-messages'

type ReviewEvent = GitHubPullRequestReviewCreateRequest['event']

export function PullRequestActions({
  projectId,
  number
}: {
  projectId: string
  number: number
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null)
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>('APPROVE')
  const [reviewBody, setReviewBody] = useState('')
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null)

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      window.spacezero.github.createPullRequestComment({ projectId, number, body }),
    onSuccess: async () => {
      setCommentBody('')
      setCommentSuccess('Comment added.')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['github', 'pull-request-comments', projectId, number]
        }),
        queryClient.invalidateQueries({
          queryKey: ['github', 'pull-request', projectId, number]
        }),
        queryClient.invalidateQueries({ queryKey: ['github', 'pull-requests', projectId] })
      ])
    }
  })
  const reviewMutation = useMutation({
    mutationFn: (request: { event: ReviewEvent; body?: string }) =>
      window.spacezero.github.createPullRequestReview({ projectId, number, ...request }),
    onSuccess: async (review) => {
      setReviewBody('')
      setReviewSuccess(review.state === 'approved' ? 'Approval submitted.' : 'Changes requested.')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['github', 'pull-request-reviews', projectId, number]
        }),
        queryClient.invalidateQueries({
          queryKey: ['github', 'pull-request', projectId, number]
        }),
        queryClient.invalidateQueries({ queryKey: ['github', 'pull-requests', projectId] })
      ])
    }
  })

  const submitComment = (): void => {
    const body = commentBody.trim()
    commentMutation.reset()
    setCommentSuccess(null)
    if (!body) {
      setCommentError('Enter a comment before submitting.')
      return
    }
    setCommentError(null)
    commentMutation.mutate(body)
  }

  const submitReview = (): void => {
    const body = reviewBody.trim()
    reviewMutation.reset()
    setReviewSuccess(null)
    if (reviewEvent === 'REQUEST_CHANGES' && !body) {
      setReviewError('Explain the changes you are requesting.')
      return
    }
    setReviewError(null)
    reviewMutation.mutate({ event: reviewEvent, ...(body ? { body } : {}) })
  }

  return (
    <section className="grid gap-5 lg:grid-cols-2" aria-label="Pull Request actions">
      <form
        className="space-y-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          submitComment()
        }}
      >
        <div>
          <h3 className="font-semibold">Add to conversation</h3>
          <p className="text-xs text-muted-foreground">Post a Pull Request conversation comment.</p>
        </div>
        <label className="text-sm font-medium" htmlFor={`pull-${number}-comment`}>
          Comment
        </label>
        <textarea
          id={`pull-${number}-comment`}
          className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm"
          value={commentBody}
          maxLength={65_536}
          disabled={commentMutation.isPending}
          onChange={(event) => {
            setCommentBody(event.target.value)
            setCommentError(null)
            setCommentSuccess(null)
          }}
        />
        {commentError ? <Feedback kind="error">{commentError}</Feedback> : null}
        {commentMutation.isError ? (
          <Feedback kind="error">{githubMutationErrorMessage(commentMutation.error)}</Feedback>
        ) : null}
        {commentSuccess ? <Feedback kind="success">{commentSuccess}</Feedback> : null}
        <Button type="submit" disabled={commentMutation.isPending}>
          {commentMutation.isPending ? 'Adding comment…' : 'Add comment'}
        </Button>
      </form>

      <form
        className="space-y-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          submitReview()
        }}
      >
        <div>
          <h3 className="font-semibold">Submit a review</h3>
          <p className="text-xs text-muted-foreground">
            GitHub review rules and permissions still apply.
          </p>
        </div>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-medium">Review decision</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`pull-${number}-review-event`}
              value="APPROVE"
              checked={reviewEvent === 'APPROVE'}
              disabled={reviewMutation.isPending}
              onChange={() => {
                setReviewEvent('APPROVE')
                setReviewError(null)
                setReviewSuccess(null)
              }}
            />
            Approve
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`pull-${number}-review-event`}
              value="REQUEST_CHANGES"
              checked={reviewEvent === 'REQUEST_CHANGES'}
              disabled={reviewMutation.isPending}
              onChange={() => {
                setReviewEvent('REQUEST_CHANGES')
                setReviewError(null)
                setReviewSuccess(null)
              }}
            />
            Request changes
          </label>
        </fieldset>
        <label className="text-sm font-medium" htmlFor={`pull-${number}-review`}>
          Review summary {reviewEvent === 'REQUEST_CHANGES' ? '(required)' : '(optional)'}
        </label>
        <textarea
          id={`pull-${number}-review`}
          className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm"
          value={reviewBody}
          maxLength={65_536}
          disabled={reviewMutation.isPending}
          onChange={(event) => {
            setReviewBody(event.target.value)
            setReviewError(null)
            setReviewSuccess(null)
          }}
        />
        {reviewError ? <Feedback kind="error">{reviewError}</Feedback> : null}
        {reviewMutation.isError ? (
          <Feedback kind="error">{githubMutationErrorMessage(reviewMutation.error)}</Feedback>
        ) : null}
        {reviewSuccess ? <Feedback kind="success">{reviewSuccess}</Feedback> : null}
        <Button type="submit" disabled={reviewMutation.isPending}>
          {reviewMutation.isPending ? 'Submitting review…' : 'Submit review'}
        </Button>
      </form>
    </section>
  )
}

function Feedback({
  kind,
  children
}: {
  kind: 'error' | 'success'
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <p
      className={kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  )
}
