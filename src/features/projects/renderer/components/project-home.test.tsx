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

  it.each([
    [
      'session.projectNotGitRepository',
      'This Project folder is not a Git repository. Choose a repository path or initialize Git with an initial commit, then retry.'
    ],
    [
      'session.projectHasNoCommits',
      'This Git repository has no commits. Create an initial commit, then retry the Session.'
    ],
    [
      'session.projectNotRepositoryRoot',
      'This Project points to a repository subdirectory. Edit the Project path to the repository root, then retry.'
    ]
  ])('shows actionable Session setup guidance for %s', async (code, message) => {
    window.spacezero.github.getConnection = async () => ({ status: 'disconnected' })

    renderProjectHome(
      <ProjectHome
        project={project}
        onProjectLinked={() => undefined}
        onNewSession={async () => {
          throw new Error(code)
        }}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'New session' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'New session' })).toBeEnabled()
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

  it('lists paginated Pull Requests and opens core detail with conversation comments', async () => {
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
    window.spacezero.github.listPullRequests = async ({ page }) => {
      requestedPages.push(page)
      return {
        page,
        hasNextPage: page === 1,
        items: [
          {
            number: page === 1 ? 79 : 80,
            title: page === 1 ? 'Managed storage foundation' : 'Follow-up Pull Request',
            state: 'open',
            isDraft: false,
            htmlUrl: `https://github.com/bity-labs/spacezero/pull/${page === 1 ? 79 : 80}`,
            author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
            baseBranch: 'main',
            headBranch: page === 1 ? 'feat/storage' : 'feat/follow-up',
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T01:00:00.000Z'
          }
        ]
      }
    }
    window.spacezero.github.getPullRequest = async ({ number }) => ({
      number,
      title: 'Managed storage foundation',
      body: 'Pull Request body',
      state: 'open',
      isDraft: false,
      htmlUrl: `https://github.com/bity-labs/spacezero/pull/${number}`,
      author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
      baseBranch: 'main',
      headBranch: 'feat/storage',
      commitCount: 4,
      conversationCommentCount: 1,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T01:00:00.000Z'
    })
    window.spacezero.github.listPullRequestComments = async ({ page }) => ({
      page,
      hasNextPage: false,
      items: [
        {
          id: '500',
          body: 'Please update the docs.',
          htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79#issuecomment-500',
          author: { id: '84', login: 'reviewer', avatarUrl: 'https://avatars.example/84' },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Pull Requests' }))
    fireEvent.click(await screen.findByRole('button', { name: /Managed storage foundation/ }))
    expect(await screen.findByText('Pull Request body')).toBeInTheDocument()
    expect(screen.getByText('feat/storage → main')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(await screen.findByText('Please update the docs.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /merge|close|checkout/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Pull Requests' }))
    const nextPage = await screen.findByRole('button', { name: 'Next' })
    await waitFor(() => expect(nextPage).toBeEnabled())
    fireEvent.click(nextPage)
    expect(await screen.findByText('Follow-up Pull Request')).toBeInTheDocument()
    expect(requestedPages).toContain(2)
  })

  it('summarizes linked GitHub work and navigates summaries to in-app detail', async () => {
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
    const issue = {
      number: 83,
      title: 'GitHub integration overview',
      body: 'Overview Issue body',
      state: 'open' as const,
      htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
      author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
      labels: [],
      assignees: [],
      commentCount: 0,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T01:00:00.000Z'
    }
    const pullRequest = {
      number: 79,
      title: 'Storage integration overview',
      state: 'open' as const,
      isDraft: false,
      htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79',
      author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
      baseBranch: 'main',
      headBranch: 'feat/storage',
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T01:00:00.000Z'
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
    window.spacezero.github.listIssues = async ({ page }) => ({
      items: [issue],
      page,
      hasNextPage: false
    })
    window.spacezero.github.getIssue = async () => issue
    window.spacezero.github.listIssueComments = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequests = async ({ page }) => ({
      items: [pullRequest],
      page,
      hasNextPage: false
    })
    window.spacezero.github.getPullRequest = async () => ({
      ...pullRequest,
      body: 'Overview Pull Request body',
      commitCount: 3,
      conversationCommentCount: 0
    })
    window.spacezero.github.listPullRequestComments = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    const onNewSession = vi.fn()

    renderProjectHome(
      <ProjectHome
        project={linkedProject}
        onProjectLinked={() => undefined}
        onNewSession={onNewSession}
      />
    )

    expect(
      await screen.findByRole('region', { name: 'GitHub workflow summary' })
    ).toBeInTheDocument()
    expect(await screen.findByText('GitHub integration overview')).toBeInTheDocument()
    expect(await screen.findByText('Storage integration overview')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute(
      'href',
      repository.htmlUrl
    )
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    expect(onNewSession).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: /GitHub integration overview/ }))
    expect(await screen.findByText('Overview Issue body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    fireEvent.click(await screen.findByRole('button', { name: /Storage integration overview/ }))
    expect(await screen.findByText('Overview Pull Request body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View all Issues' }))
    expect(await screen.findByRole('region', { name: 'GitHub Issues' })).toBeInTheDocument()
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
