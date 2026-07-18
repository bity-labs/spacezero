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

describe('Pull Request-linked Session action', () => {
  it('opens the confirmed isolated PR Session without a GitHub write or checkout control', async () => {
    setupPullRequest()
    const createComment = vi.spyOn(window.spacezero.github, 'createPullRequestComment')
    const createReview = vi.spyOn(window.spacezero.github, 'createPullRequestReview')
    const onSessionCreated = vi.fn()
    window.spacezero.github.startPullRequestSession = async () => ({
      id: 'session-pr-1',
      kind: 'project',
      projectId: 'project-1',
      title: 'Pull Request #79: Managed storage foundation',
      status: 'idle',
      worktree: {
        path: '/SpaceZero/worktrees/project-1/session-pr-1',
        branch: 'spacezero/pull-request-79-session-pr-1',
        baseRevision: 'def456'
      },
      source: {
        type: 'pull-request',
        repositoryId: '1000',
        repositoryNodeId: 'R_1000',
        repositoryOwner: 'bity-labs',
        repositoryName: 'spacezero',
        repositoryFullName: 'bity-labs/spacezero',
        number: 79,
        url: 'https://github.com/bity-labs/spacezero/pull/79',
        title: 'Managed storage foundation'
      },
      createdAt: '2026-07-18T02:00:00.000Z',
      updatedAt: '2026-07-18T02:00:00.000Z'
    })

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <PullRequestsView
          project={project}
          initialPullRequestNumber={79}
          onSessionCreated={onSessionCreated}
        />
      </QueryClientProvider>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Start Session from Pull Request' }))

    expect(
      await screen.findByRole('button', { name: 'Start Session from Pull Request' })
    ).toBeEnabled()
    expect(onSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-pr-1',
        worktree: expect.objectContaining({ baseRevision: 'def456' }),
        source: expect.objectContaining({ type: 'pull-request', number: 79 })
      })
    )
    expect(createComment).not.toHaveBeenCalled()
    expect(createReview).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /checkout|merge|close/i })).not.toBeInTheDocument()
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
    expect(screen.getByRole('region', { name: 'Pull Request actions' })).toBeInTheDocument()
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

  it('reports creation failure without disturbing the base Project', async () => {
    setupPullRequest()
    const onSessionCreated = vi.fn()
    window.spacezero.github.startPullRequestSession = async () => {
      throw new Error('session.worktreeCreateFailed')
    }

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <PullRequestsView
          project={project}
          initialPullRequestNumber={79}
          onSessionCreated={onSessionCreated}
        />
      </QueryClientProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Start Session from Pull Request' }))

    expect(
      await screen.findByText(
        'Could not create an isolated Session for this Pull Request. The base Project was not changed.'
      )
    ).toBeInTheDocument()
    expect(onSessionCreated).not.toHaveBeenCalled()
  })
})
