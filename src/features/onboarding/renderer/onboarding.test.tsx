import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Onboarding } from './onboarding'

const identity = {
  id: '42',
  login: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
  profileUrl: 'https://github.com/octocat'
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

describe('Onboarding repository setup', () => {
  it('does not finish onboarding while a managed clone is active', async () => {
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity,
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.listRepositorySetupOptions = async () => [{ repository }]
    window.spacezero.github.onCloneProgress = () => () => undefined
    window.spacezero.github.startClone = async () => ({
      status: 'started',
      operationId: 'clone-1'
    })

    render(<Onboarding onComplete={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Set up a Project' }))
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))

    await screen.findByText('Preparing managed clone…')
    expect(screen.getByRole('button', { name: 'Continue without a Project' })).toBeDisabled()
  })
})
