import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GitHubCloneProgress } from '../../shared'
import { RepositorySetup } from './repository-setup'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
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

describe('RepositorySetup', () => {
  it('selects exactly one authorized repository and reports clone completion', async () => {
    window.spacezero.github.listRepositorySetupOptions = async () => [{ repository }]
    let progressListener: ((event: GitHubCloneProgress) => void) | undefined
    window.spacezero.github.onCloneProgress = (listener) => {
      progressListener = listener
      return () => undefined
    }
    const startClone = vi.fn(async () => ({
      status: 'started' as const,
      operationId: 'clone-1'
    }))
    window.spacezero.github.startClone = startClone
    const onProjectReady = vi.fn()

    render(<RepositorySetup onProjectReady={onProjectReady} />)

    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    expect(screen.getByRole('checkbox', { name: /Trust project agent resources/ })).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: /Trust project agent resources/ }))
    expect(screen.getByRole('checkbox', { name: /Trust project agent resources/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))
    await waitFor(() =>
      expect(startClone).toHaveBeenCalledWith({
        repositoryId: '1000',
        agentResourcesTrusted: true
      })
    )
    await screen.findByText('Preparing managed clone…')
    progressListener?.({
      operationId: 'clone-1',
      status: 'cloning',
      message: 'Cloning repository…',
      percent: 60
    })
    expect(await screen.findByText('Cloning repository… 60%')).toBeInTheDocument()
    progressListener?.({
      operationId: 'clone-1',
      status: 'complete',
      message: 'Repository cloned and Project added.',
      projectId: 'project-1'
    })

    await waitFor(() => expect(onProjectReady).toHaveBeenCalledWith('project-1'))
  })

  it('marks registered repositories Already added and opens them without cloning', async () => {
    window.spacezero.github.listRepositorySetupOptions = async () => [
      { repository, existingProject: { id: 'project-1', name: 'Space Zero' } }
    ]
    window.spacezero.github.startClone = async () => ({
      status: 'already-added',
      projectId: 'project-1'
    })
    const onProjectReady = vi.fn()

    render(<RepositorySetup onProjectReady={onProjectReady} />)

    expect(await screen.findByText('Already added')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Project' }))

    await waitFor(() => expect(onProjectReady).toHaveBeenCalledWith('project-1'))
  })

  it('requires an explicit local Project choice for ambiguous exact remote matches', async () => {
    window.spacezero.github.listRepositorySetupOptions = async () => [
      {
        repository,
        matchingProjects: [
          { id: 'project-1', name: 'Space Zero local' },
          { id: 'project-2', name: 'Space Zero backup' }
        ]
      }
    ]
    window.spacezero.github.onCloneProgress = () => () => undefined
    const requests: unknown[] = []
    window.spacezero.github.startClone = async (request) => {
      requests.push(request)
      return { status: 'already-added', projectId: 'project-2' }
    }
    const onProjectReady = vi.fn()

    render(<RepositorySetup onProjectReady={onProjectReady} />)

    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    expect(screen.getByRole('button', { name: 'Link Project' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Space Zero backup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Link Project' }))

    await waitFor(() => expect(onProjectReady).toHaveBeenCalledWith('project-2'))
    expect(requests).toEqual([{ repositoryId: '1000', existingProjectId: 'project-2' }])
  })

  it('keeps one repository operation selected and cancels it when the setup surface closes', async () => {
    const secondRepository = {
      ...repository,
      id: '2000',
      nodeId: 'R_2000',
      name: 'other',
      fullName: 'bity-labs/other',
      htmlUrl: 'https://github.com/bity-labs/other',
      cloneUrl: 'https://github.com/bity-labs/other.git'
    }
    window.spacezero.github.listRepositorySetupOptions = async () => [
      { repository },
      { repository: secondRepository }
    ]
    window.spacezero.github.onCloneProgress = () => () => undefined
    window.spacezero.github.startClone = async () => ({
      status: 'started',
      operationId: 'clone-1'
    })
    const cancelClone = vi.fn(async () => undefined)
    window.spacezero.github.cancelClone = cancelClone
    const onBusyChange = vi.fn()

    const view = render(
      <RepositorySetup onProjectReady={() => undefined} onBusyChange={onBusyChange} />
    )
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))

    await screen.findByText('Preparing managed clone…')
    expect(screen.getByRole('radio', { name: /bity-labs\/other/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clone repository' })).toBeDisabled()
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true))

    view.unmount()
    await waitFor(() => expect(cancelClone).toHaveBeenCalledWith({ operationId: 'clone-1' }))
  })

  it('cancels an operation that starts after the setup surface has already closed', async () => {
    window.spacezero.github.listRepositorySetupOptions = async () => [{ repository }]
    window.spacezero.github.onCloneProgress = () => () => undefined
    const startResult = deferred<Awaited<ReturnType<typeof window.spacezero.github.startClone>>>()
    window.spacezero.github.startClone = async () => startResult.promise
    const cancelClone = vi.fn(async () => undefined)
    window.spacezero.github.cancelClone = cancelClone

    const view = render(<RepositorySetup onProjectReady={() => undefined} />)
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))
    view.unmount()
    startResult.resolve({ status: 'started', operationId: 'clone-late' })

    await waitFor(() => expect(cancelClone).toHaveBeenCalledWith({ operationId: 'clone-late' }))
  })

  it('offers retry or cancellation without showing false success', async () => {
    window.spacezero.github.listRepositorySetupOptions = async () => [{ repository }]
    let progressListener: ((event: GitHubCloneProgress) => void) | undefined
    window.spacezero.github.onCloneProgress = (listener) => {
      progressListener = listener
      return () => undefined
    }
    window.spacezero.github.startClone = async () => ({
      status: 'started',
      operationId: 'clone-1'
    })
    const cancellations: string[] = []
    window.spacezero.github.cancelClone = async ({ operationId }) => {
      cancellations.push(operationId)
    }

    render(<RepositorySetup onProjectReady={() => undefined} />)
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel clone' }))
    expect(cancellations).toEqual(['clone-1'])

    progressListener?.({
      operationId: 'clone-1',
      status: 'failed',
      message: 'Clone failed. Check repository access, network, and destination, then retry.'
    })
    expect(await screen.findByRole('button', { name: 'Retry clone' })).toBeInTheDocument()
    expect(screen.queryByText('Repository cloned and Project added.')).not.toBeInTheDocument()
  })
})
