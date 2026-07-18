import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../projects/shared'
import { createGitHubQueryClient } from '../github-query-client'
import { ProjectGitHubOverview } from './project-github-overview'

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/tmp/spacezero',
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

function renderOverview(): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={createGitHubQueryClient()}>
      <ProjectGitHubOverview
        project={project}
        onOpenIssue={() => undefined}
        onViewIssues={() => undefined}
        onOpenPullRequest={() => undefined}
        onViewPullRequests={() => undefined}
      />
    </QueryClientProvider>
  )
}

describe('ProjectGitHubOverview', () => {
  it('preserves a Pull Request summary when the Issue endpoint fails and refreshes manually', async () => {
    let issueReads = 0
    let pullRequestReads = 0
    window.spacezero.github.listIssues = async () => {
      issueReads += 1
      throw new Error('github.rateLimited')
    }
    window.spacezero.github.listPullRequests = async ({ page }) => {
      pullRequestReads += 1
      return {
        items: [
          {
            number: 79,
            title: 'Storage foundation',
            state: 'open',
            isDraft: false,
            htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79',
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            baseBranch: 'main',
            headBranch: 'feat/storage',
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T01:00:00.000Z'
          }
        ],
        page,
        hasNextPage: false
      }
    }

    renderOverview()

    expect(await screen.findByText(/rate limit was reached/i)).toBeInTheDocument()
    expect(await screen.findByText('Storage foundation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workflows' }))
    await waitFor(() => {
      expect(issueReads).toBeGreaterThan(1)
      expect(pullRequestReads).toBeGreaterThan(1)
    })
  })

  it('hides previously loaded private titles when a refresh loses repository access', async () => {
    let accessRevoked = false
    window.spacezero.github.listIssues = async ({ page }) => {
      if (accessRevoked) throw new Error('github.repositoryAccessRevoked')
      return {
        items: [
          {
            number: 83,
            title: 'Private roadmap details',
            body: null,
            state: 'open',
            htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            labels: [],
            assignees: [],
            commentCount: 0,
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T01:00:00.000Z'
          }
        ],
        page,
        hasNextPage: false
      }
    }
    window.spacezero.github.listPullRequests = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })

    renderOverview()
    expect(await screen.findByText('Private roadmap details')).toBeInTheDocument()

    accessRevoked = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workflows' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Private roadmap details')).not.toBeInTheDocument()
  })

  it('shows independent empty states and contextual navigation controls', async () => {
    window.spacezero.github.listIssues = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequests = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    const onViewIssues = vi.fn()
    const onViewPullRequests = vi.fn()

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <ProjectGitHubOverview
          project={project}
          onOpenIssue={() => undefined}
          onViewIssues={onViewIssues}
          onOpenPullRequest={() => undefined}
          onViewPullRequests={onViewPullRequests}
        />
      </QueryClientProvider>
    )

    expect(await screen.findByText('No Issues to show.')).toBeInTheDocument()
    expect(await screen.findByText('No Pull Requests to show.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View all Issues' }))
    fireEvent.click(screen.getByRole('button', { name: 'View all Pull Requests' }))
    expect(onViewIssues).toHaveBeenCalledOnce()
    expect(onViewPullRequests).toHaveBeenCalledOnce()
  })
})
