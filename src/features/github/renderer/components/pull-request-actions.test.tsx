import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { createGitHubQueryClient } from '../github-query-client'
import { PullRequestActions } from './pull-request-actions'

describe('PullRequestActions', () => {
  it('validates input, waits for GitHub confirmation, reports rule failures, and invalidates on success', async () => {
    const queryClient = createGitHubQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let commentCalls = 0
    let completeComment: (() => void) | undefined
    let reviewCalls = 0
    window.spacezero.github.createPullRequestComment = async (request) => {
      commentCalls += 1
      return new Promise((resolve) => {
        completeComment = () =>
          resolve({
            id: 'comment-1',
            body: request.body,
            htmlUrl: 'https://github.com/example/repository/pull/79#comment-1',
            author: null,
            createdAt: '2026-07-18T04:00:00.000Z',
            updatedAt: '2026-07-18T04:00:00.000Z'
          })
      })
    }
    window.spacezero.github.createPullRequestReview = async (request) => {
      reviewCalls += 1
      if (reviewCalls === 1) throw new Error('github.ruleOrValidationFailed')
      return {
        id: 'review-1',
        state: request.event === 'APPROVE' ? 'approved' : 'changes_requested',
        body: request.body ?? null,
        htmlUrl: 'https://github.com/example/repository/pull/79#review-1',
        author: null,
        submittedAt: '2026-07-18T04:00:00.000Z'
      }
    }

    render(
      <QueryClientProvider client={queryClient}>
        <PullRequestActions projectId="project-1" number={79} />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.getByText('Enter a comment before submitting.')).toBeInTheDocument()
    expect(commentCalls).toBe(0)

    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'A conversation note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.getByRole('button', { name: 'Adding comment…' })).toBeDisabled()
    expect(screen.queryByText('Comment added.')).not.toBeInTheDocument()
    await waitFor(() => expect(completeComment).toBeDefined())
    completeComment?.()
    expect(await screen.findByText('Comment added.')).toBeInTheDocument()
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['github', 'pull-request-comments', 'project-1', 79]
      })
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Request changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    expect(screen.getByText('Explain the changes you are requesting.')).toBeInTheDocument()
    expect(reviewCalls).toBe(0)

    fireEvent.change(screen.getByLabelText('Review summary (required)'), {
      target: { value: 'Please add coverage.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    expect(
      await screen.findByText(
        'GitHub rejected this change because it violates a repository rule or GitHub validation.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Changes requested.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Approve' }))
    fireEvent.change(screen.getByLabelText('Review summary (optional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    expect(await screen.findByText('Approval submitted.')).toBeInTheDocument()
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['github', 'pull-request-reviews', 'project-1', 79]
      })
    )

    expect(screen.queryByRole('button', { name: /merge|close|checkout/i })).not.toBeInTheDocument()
  })
})
