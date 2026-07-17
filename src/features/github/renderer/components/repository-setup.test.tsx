import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GitHubCloneProgress } from '../../shared'
import { RepositorySetup } from './repository-setup'

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
    window.spacezero.github.startClone = async () => ({
      status: 'started',
      operationId: 'clone-1'
    })
    const onProjectReady = vi.fn()

    render(<RepositorySetup onProjectReady={onProjectReady} />)

    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))
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
