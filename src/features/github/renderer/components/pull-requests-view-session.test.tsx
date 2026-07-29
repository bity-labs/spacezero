import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../projects/shared'
import { createGitHubQueryClient } from '../github-query-client'
import { PullRequestsView } from './pull-requests-view'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/repos/spacezero',
  githubRepository: {
    repositoryId: '1000',
    nodeId: 'R_1000',
    owner: 'bity-labs',
    name: 'spacezero',
    fullName: 'bity-labs/spacezero',
    htmlUrl: 'https://github.com/bity-labs/spacezero',
    linkedAt: '2026-07-18T00:00:00.000Z'
  },
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
}

function setupPullRequest(): void {
  window.spacezero.github.getPullRequest = async () => ({
    number: 79,
    title: 'Managed storage foundation',
    body: 'Pull Request body',
    state: 'open',
    isDraft: false,
    htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79',
    author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
    baseBranch: 'main',
    headBranch: 'feat/storage',
    commitCount: 4,
    conversationCommentCount: 0,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T01:00:00.000Z'
  })
  window.spacezero.github.listPullRequestComments = async ({ page }) => ({
    items: [],
    page,
    hasNextPage: false
  })
}

describe('Pull Request detail actions', () => {
  it('hides PR session, write, and checkout controls', async () => {
    setupPullRequest()
    const createComment = vi.spyOn(window.spacezero.github, 'createPullRequestComment')
    const createReview = vi.spyOn(window.spacezero.github, 'createPullRequestReview')
    const startSession = vi.spyOn(window.spacezero.github, 'startPullRequestSession')

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <PullRequestsView project={project} initialPullRequestNumber={79} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Managed storage foundation')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start Session from Pull Request' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pull Request actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /checkout|merge|close/i })).not.toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
    expect(createComment).not.toHaveBeenCalled()
    expect(createReview).not.toHaveBeenCalled()
  })

  it('hides cached Pull Request content and write actions after access is revoked', async () => {
    setupPullRequest()
    let accessRevoked = false
    const getPullRequest = window.spacezero.github.getPullRequest
    window.spacezero.github.getPullRequest = async (request) => {
      if (accessRevoked) throw new Error('github.repositoryAccessRevoked')
      return getPullRequest(request)
    }

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <PullRequestsView project={project} initialPullRequestNumber={79} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Managed storage foundation')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pull Request actions' })).not.toBeInTheDocument()
    accessRevoked = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(
      await screen.findByText(
        'Repository access was revoked. Restore GitHub App access before loading Pull Request.'
      )
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Managed storage foundation')).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Pull Request actions' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Start Session from Pull Request' })
      ).not.toBeInTheDocument()
    })
  })
})
