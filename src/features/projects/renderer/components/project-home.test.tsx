import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { focusManager, QueryClientProvider } from '@tanstack/react-query'

import { createGitHubQueryClient } from '../../../github/renderer'
import type { Project } from '../../shared'
import { ProjectHome } from './project-home'

function renderProjectHome(component: React.ReactNode): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={createGitHubQueryClient()}>{component}</QueryClientProvider>
  )
}

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/external/workspaces/spacezero',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
}

const repository = {
  id: '1000',
  nodeId: 'R_1000',
  installationId: '100',
  owner: 'bity-labs',
  name: 'spacezero',
  fullName: 'bity-labs/spacezero',
  isPrivate: true,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/bity-labs/spacezero',
  cloneUrl: 'https://github.com/bity-labs/spacezero.git'
}

describe('ProjectHome', () => {
  it('keeps GitHub navigation discoverable while disconnected', async () => {
    window.spacezero.github.getConnection = async () => ({ status: 'disconnected' })

    renderProjectHome(
      <ProjectHome
        project={project}
        onProjectLinked={() => undefined}
        onNewSession={() => undefined}
      />
    )

    expect(await screen.findByRole('heading', { name: 'Space Zero' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issues' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pull Requests' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect GitHub' })).toHaveAttribute(
      'href',
      '#/settings?section=account'
    )
  })

  it('suggests a matching remote and links the selected authorized repository', async () => {
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.getProjectLinkOptions = async () => ({
      repositories: [repository],
      suggestedRepositoryIds: ['1000'],
      ambiguous: false
    })
    const linkedProject: Project = {
      ...project,
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        linkedAt: '2026-07-18T01:00:00.000Z'
      }
    }
    window.spacezero.github.linkProjectRepository = async () => linkedProject
    window.spacezero.github.getProjectRepository = async () => repository
    const onProjectLinked = vi.fn()

    renderProjectHome(
      <ProjectHome
        project={project}
        onProjectLinked={onProjectLinked}
        onNewSession={() => undefined}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Link GitHub repository' }))

    expect(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ })).toBeChecked()
    expect(screen.getByText('Matches a local Git remote')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Link repository' }))

    await waitFor(() => expect(onProjectLinked).toHaveBeenCalledWith(linkedProject))
    expect(await screen.findByText('bity-labs/spacezero')).toBeInTheDocument()
  })

  it('shows live repository status and refetches on refresh, view activation, and focus', async () => {
    const linkedProject: Project = {
      ...project,
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        linkedAt: '2026-07-18T01:00:00.000Z'
      }
    }
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    let repositoryReads = 0
    window.spacezero.github.getProjectRepository = async () => {
      repositoryReads += 1
      return repository
    }

    renderProjectHome(
      <ProjectHome
        project={linkedProject}
        onProjectLinked={() => undefined}
        onNewSession={() => undefined}
      />
    )

    expect(await screen.findByText('Private · Default branch main')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute(
      'href',
      repository.htmlUrl
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(repositoryReads).toBe(2))

    fireEvent.click(screen.getByRole('button', { name: 'Issues' }))
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    await waitFor(() => expect(repositoryReads).toBe(3))

    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await waitFor(() => expect(repositoryReads).toBe(4))
    focusManager.setFocused(undefined)
  })

  it('lists paginated Issues and opens Issue detail with comments', async () => {
    const linkedProject: Project = {
      ...project,
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        linkedAt: '2026-07-18T01:00:00.000Z'
      }
    }
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.getProjectRepository = async () => repository
    const requestedPages: number[] = []
    window.spacezero.github.listIssues = async ({ page }) => {
      requestedPages.push(page)
      return {
        page,
        hasNextPage: page === 1,
        items: [
          {
            number: page === 1 ? 83 : 84,
            title: page === 1 ? 'GitHub integration' : 'Follow-up Issue',
            body: 'Issue body',
            state: 'open',
            htmlUrl: `https://github.com/bity-labs/spacezero/issues/${page === 1 ? 83 : 84}`,
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            labels: [{ id: '1', name: 'enhancement', color: '0e8a16' }],
            assignees: [],
            commentCount: 1,
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T01:00:00.000Z'
          }
        ]
      }
    }
    window.spacezero.github.getIssue = async ({ number }) => ({
      number,
      title: 'GitHub integration',
      body: 'Detailed Issue body',
      state: 'open',
      htmlUrl: `https://github.com/bity-labs/spacezero/issues/${number}`,
      author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
      labels: [{ id: '1', name: 'enhancement', color: '0e8a16' }],
      assignees: [{ id: '84', login: 'maintainer', avatarUrl: 'https://avatars.example/84' }],
      commentCount: 1,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T01:00:00.000Z'
    })
    window.spacezero.github.listIssueComments = async ({ page }) => ({
      page,
      hasNextPage: false,
      items: [
        {
          id: '500',
          body: 'Looks good',
          htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83#issuecomment-500',
          author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
          createdAt: '2026-07-18T02:00:00.000Z',
          updatedAt: '2026-07-18T02:00:00.000Z'
        }
      ]
    })

    renderProjectHome(
      <ProjectHome
        project={linkedProject}
        onProjectLinked={() => undefined}
        onNewSession={() => undefined}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Issues' }))
    fireEvent.click(await screen.findByRole('button', { name: /GitHub integration/ }))
    expect(await screen.findByText('Detailed Issue body')).toBeInTheDocument()
    expect(screen.getByText(/Assignees: maintainer/)).toBeInTheDocument()
    expect(await screen.findByText('Looks good')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Issues' }))
    const nextPage = await screen.findByRole('button', { name: 'Next' })
    await waitFor(() => expect(nextPage).toBeEnabled())
    fireEvent.click(nextPage)
    expect(await screen.findByText('Follow-up Issue')).toBeInTheDocument()
    expect(requestedPages).toContain(2)
  })

  it('validates comments and shows confirmed Issue mutations without optimistic success', async () => {
    const linkedProject: Project = {
      ...project,
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        linkedAt: '2026-07-18T01:00:00.000Z'
      }
    }
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.getProjectRepository = async () => repository
    let issueState: 'open' | 'closed' = 'open'
    let listReads = 0
    let commentMutationCalls = 0
    let completeComment: (() => void) | undefined
    let rejectStateMutation = false
    const comments: string[] = []
    const issue = () => ({
      number: 83,
      title: 'GitHub integration',
      body: 'Issue body',
      state: issueState,
      htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
      author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
      labels: [],
      assignees: [],
      commentCount: comments.length,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T01:00:00.000Z'
    })
    window.spacezero.github.listIssues = async ({ page }) => {
      listReads += 1
      return { items: [issue()], page, hasNextPage: false }
    }
    window.spacezero.github.getIssue = async () => issue()
    window.spacezero.github.listIssueComments = async ({ page }) => ({
      items: comments.map((body, index) => ({
        id: String(index + 1),
        body,
        htmlUrl: `https://github.com/bity-labs/spacezero/issues/83#comment-${index + 1}`,
        author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
        createdAt: '2026-07-18T02:00:00.000Z',
        updatedAt: '2026-07-18T02:00:00.000Z'
      })),
      page,
      hasNextPage: false
    })
    window.spacezero.github.createIssueComment = async (request) => {
      commentMutationCalls += 1
      return new Promise((resolve) => {
        completeComment = () => {
          comments.push(request.body)
          resolve({
            id: '1',
            body: request.body,
            htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83#comment-1',
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            createdAt: '2026-07-18T02:00:00.000Z',
            updatedAt: '2026-07-18T02:00:00.000Z'
          })
        }
      })
    }
    window.spacezero.github.updateIssueState = async (request) => {
      if (rejectStateMutation) throw new Error('github.permissionDenied')
      issueState = request.state
      return issue()
    }

    renderProjectHome(
      <ProjectHome
        project={linkedProject}
        onProjectLinked={() => undefined}
        onNewSession={() => undefined}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Issues' }))
    fireEvent.click(await screen.findByRole('button', { name: /GitHub integration/ }))
    await screen.findByRole('button', { name: 'Close Issue' })

    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.getByText('Enter a comment before submitting.')).toBeInTheDocument()
    expect(commentMutationCalls).toBe(0)

    fireEvent.change(screen.getByLabelText('Add a comment'), {
      target: { value: 'A new comment' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.getByRole('button', { name: 'Adding comment…' })).toBeDisabled()
    expect(screen.queryByText('Comment added.')).not.toBeInTheDocument()
    await waitFor(() => expect(completeComment).toBeDefined())
    completeComment?.()
    expect(await screen.findByText('Comment added.')).toBeInTheDocument()
    expect(await screen.findByText('A new comment')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close Issue' }))
    expect(await screen.findByText('Issue closed.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Reopen Issue' })).toBeInTheDocument()

    rejectStateMutation = true
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Issue' }))
    expect(
      await screen.findByText('GitHub denied this change. Check your repository permissions.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reopen Issue' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Issues' }))
    await waitFor(() => expect(listReads).toBeGreaterThan(1))
  })

  it('shows revoked repository access as stale rather than false success', async () => {
    const linkedProject: Project = {
      ...project,
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        linkedAt: '2026-07-18T01:00:00.000Z'
      }
    }
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.getProjectRepository = async () => {
      throw new Error('github.repositoryAccessRevoked')
    }

    renderProjectHome(
      <ProjectHome
        project={linkedProject}
        onProjectLinked={() => undefined}
        onNewSession={() => undefined}
      />
    )

    expect(
      await screen.findByRole('heading', { name: 'Repository status unavailable' })
    ).toBeInTheDocument()
    expect(screen.getByText(/access changed or was revoked/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open on GitHub' })).not.toBeInTheDocument()
  })

  it('requires confirmation before linking an ambiguous remote match', async () => {
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.getProjectLinkOptions = async () => ({
      repositories: [repository],
      suggestedRepositoryIds: ['1000', '2000'],
      ambiguous: true
    })
    const linkRequests: unknown[] = []
    window.spacezero.github.linkProjectRepository = async (request) => {
      linkRequests.push(request)
      return project
    }
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderProjectHome(
      <ProjectHome
        project={project}
        onProjectLinked={() => undefined}
        onNewSession={() => undefined}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Link GitHub repository' }))
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Link repository' }))

    expect(linkRequests).toEqual([])
  })
})
