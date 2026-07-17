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
