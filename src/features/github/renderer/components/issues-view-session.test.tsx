import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../projects/shared'
import { createGitHubQueryClient } from '../github-query-client'
import { IssuesView } from './issues-view'

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

function setupIssue(): void {
  window.spacezero.github.getIssue = async () => ({
    number: 83,
    title: 'GitHub integration',
    body: 'Issue body',
    state: 'open',
    htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
    author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
    labels: [],
    assignees: [],
    commentCount: 0,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T01:00:00.000Z'
  })
  window.spacezero.github.listIssueComments = async ({ page }) => ({
    items: [],
    page,
    hasNextPage: false
  })
}

describe('Issue-linked Session action', () => {
  it('opens the confirmed isolated Session without mutating the Issue', async () => {
    setupIssue()
    const createComment = vi.spyOn(window.spacezero.github, 'createIssueComment')
    const updateState = vi.spyOn(window.spacezero.github, 'updateIssueState')
    const onSessionCreated = vi.fn()
    window.spacezero.github.startIssueSession = async () => ({
      id: 'session-1',
      kind: 'project',
      projectId: 'project-1',
      title: 'Issue #83: GitHub integration',
      status: 'idle',
      worktree: {
        path: '/SpaceZero/worktrees/project-1/session-1',
        branch: 'spacezero/issue-83-session-1',
        baseRevision: 'abc123'
      },
      source: {
        type: 'issue',
        repositoryId: '1000',
        repositoryNodeId: 'R_1000',
        repositoryOwner: 'bity-labs',
        repositoryName: 'spacezero',
        repositoryFullName: 'bity-labs/spacezero',
        number: 83,
        url: 'https://github.com/bity-labs/spacezero/issues/83',
        title: 'GitHub integration'
      },
      createdAt: '2026-07-18T02:00:00.000Z',
      updatedAt: '2026-07-18T02:00:00.000Z'
    })

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <IssuesView project={project} initialIssueNumber={83} onSessionCreated={onSessionCreated} />
      </QueryClientProvider>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Start Session from Issue' }))

    expect(await screen.findByRole('button', { name: 'Start Session from Issue' })).toBeEnabled()
    expect(onSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-1',
        worktree: expect.objectContaining({ path: '/SpaceZero/worktrees/project-1/session-1' }),
        source: expect.objectContaining({ type: 'issue', number: 83 })
      })
    )
    expect(createComment).not.toHaveBeenCalled()
    expect(updateState).not.toHaveBeenCalled()
  })

  it('hides cached Issue content and write actions after access is revoked', async () => {
    setupIssue()
    let accessRevoked = false
    const getIssue = window.spacezero.github.getIssue
    window.spacezero.github.getIssue = async (request) => {
      if (accessRevoked) throw new Error('github.repositoryAccessRevoked')
      return getIssue(request)
    }

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <IssuesView project={project} initialIssueNumber={83} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('GitHub integration')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Issue' })).toBeInTheDocument()
    accessRevoked = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(
      await screen.findByText(
        'Repository access was revoked. Restore GitHub App access before loading Issue.'
      )
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('GitHub integration')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Close Issue' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument()
    })
  })

  it('reports creation failure without opening a missing Session', async () => {
    setupIssue()
    const onSessionCreated = vi.fn()
    window.spacezero.github.startIssueSession = async () => {
      throw new Error('session.worktreeCreateFailed')
    }

    render(
      <QueryClientProvider client={createGitHubQueryClient()}>
        <IssuesView project={project} initialIssueNumber={83} onSessionCreated={onSessionCreated} />
      </QueryClientProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Start Session from Issue' }))

    expect(
      await screen.findByText(
        'Could not create an isolated Session for this Issue. The Project was not changed.'
      )
    ).toBeInTheDocument()
    expect(onSessionCreated).not.toHaveBeenCalled()
  })
})
