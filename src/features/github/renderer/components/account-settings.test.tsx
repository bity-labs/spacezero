import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AccountSettings } from './account-settings'

describe('AccountSettings', () => {
  it('authorizes in the system browser and shows identity as requiring repository access', async () => {
    const copiedFlows: string[] = []
    const openedFlows: string[] = []
    let storedConnection: Awaited<ReturnType<typeof window.spacezero.github.getConnection>> = {
      status: 'disconnected'
    }
    window.spacezero.github.getConnection = async () => storedConnection
    window.spacezero.github.startAuthorization = async () => ({
      flowId: 'flow-1',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-07-18T00:15:00.000Z'
    })
    window.spacezero.github.copyDeviceCode = async ({ flowId }) => {
      copiedFlows.push(flowId)
    }
    window.spacezero.github.openAuthorization = async ({ flowId }) => {
      openedFlows.push(flowId)
    }
    let finishAuthorization: (() => void) | undefined
    window.spacezero.github.waitForAuthorization = () =>
      new Promise((resolve) => {
        finishAuthorization = () => {
          storedConnection = {
            status: 'repository-access-required',
            identity: {
              id: '42',
              login: 'octocat',
              avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
              profileUrl: 'https://github.com/octocat'
            }
          }
          resolve(storedConnection)
        }
      })

    render(<AccountSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }))

    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open GitHub' }))

    await waitFor(() => expect(copiedFlows).toEqual(['flow-1']))
    expect(openedFlows).toEqual(['flow-1'])
    finishAuthorization?.()
    expect(await screen.findByText('@octocat')).toBeInTheDocument()
    expect(screen.getByText('Repository access required')).toBeInTheDocument()
    expect(screen.queryByText('access-secret')).not.toBeInTheDocument()
  })

  it('finishes connection only after installation exposes an accessible repository', async () => {
    const identity = {
      id: '42',
      login: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
      profileUrl: 'https://github.com/octocat'
    }
    let installed = false
    let installationOpens = 0
    window.spacezero.github.getConnection = async () =>
      installed
        ? {
            status: 'connected',
            identity,
            installations: [
              {
                id: '100',
                owner: { ...identity, type: 'user', avatarUrl: identity.avatarUrl },
                repositorySelection: 'selected',
                status: 'usable',
                repositoryCount: 1
              }
            ],
            repositories: [
              {
                id: '1000',
                nodeId: 'R_1000',
                installationId: '100',
                owner: 'octocat',
                name: 'hello-world',
                fullName: 'octocat/hello-world',
                isPrivate: false,
                defaultBranch: 'main',
                htmlUrl: 'https://github.com/octocat/hello-world',
                cloneUrl: 'https://github.com/octocat/hello-world.git'
              }
            ]
          }
        : { status: 'repository-access-required', identity }
    window.spacezero.github.openInstallation = async () => {
      installationOpens += 1
      installed = true
    }

    render(<AccountSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Choose repository access' }))
    expect(installationOpens).toBe(1)
    fireEvent.click(await screen.findByRole('button', { name: 'Check repository access' }))

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('1 accessible repository across 1 installation.')).toBeInTheDocument()
  })

  it('shows pending organization approval without blocking local use', async () => {
    window.spacezero.github.getConnection = async () => ({
      status: 'pending-organization-approval',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [
        {
          id: '200',
          owner: {
            id: '84',
            login: 'bity-labs',
            type: 'organization',
            avatarUrl: 'https://avatars.githubusercontent.com/u/84?v=4'
          },
          repositorySelection: 'selected',
          status: 'pending-approval',
          repositoryCount: 0
        }
      ]
    })

    render(<AccountSettings />)

    expect(await screen.findAllByText('Pending organization approval')).toHaveLength(2)
    expect(screen.getByText(/continue using local Projects/i)).toBeInTheDocument()
  })

  it('groups installations and manages or disconnects the local connection', async () => {
    let connected = true
    const openedActions: string[] = []
    window.spacezero.github.getConnection = async () =>
      connected
        ? {
            status: 'connected',
            identity: {
              id: '42',
              login: 'octocat',
              avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
              profileUrl: 'https://github.com/octocat'
            },
            installations: [
              {
                id: '100',
                owner: {
                  id: '42',
                  login: 'octocat',
                  type: 'user',
                  avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4'
                },
                repositorySelection: 'selected',
                status: 'usable',
                repositoryCount: 1
              },
              {
                id: '200',
                owner: {
                  id: '84',
                  login: 'bity-labs',
                  type: 'organization',
                  avatarUrl: 'https://avatars.githubusercontent.com/u/84?v=4'
                },
                repositorySelection: 'all',
                status: 'usable',
                repositoryCount: 3
              }
            ],
            repositories: []
          }
        : { status: 'disconnected' }
    window.spacezero.github.openInstallation = async () => {
      openedActions.push('install')
    }
    window.spacezero.github.openManageAccess = async () => {
      openedActions.push('manage')
    }
    window.spacezero.github.disconnect = async () => {
      connected = false
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AccountSettings />)

    expect(
      await screen.findByRole('region', { name: 'Personal GitHub installations' })
    ).toHaveTextContent('octocatSelected repositories1 repository')
    expect(
      screen.getByRole('region', { name: 'Organizations GitHub installations' })
    ).toHaveTextContent('bity-labsAll repositories3 repositories')
    fireEvent.click(screen.getByRole('button', { name: 'Add or change repository access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage/Revoke access on GitHub' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => expect(openedActions).toEqual(['install', 'manage']))
    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument()
  })

  it('cancels authorization without showing a connected state', async () => {
    let rejectWait: ((error: Error) => void) | undefined
    window.spacezero.github.getConnection = async () => ({ status: 'disconnected' })
    window.spacezero.github.startAuthorization = async () => ({
      flowId: 'flow-1',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-07-18T00:15:00.000Z'
    })
    window.spacezero.github.waitForAuthorization = () =>
      new Promise((_resolve, reject) => {
        rejectWait = reject
      })
    window.spacezero.github.cancelAuthorization = vi.fn(async () => {
      rejectWait?.(new Error('github.authorization-cancelled'))
    })

    render(<AccountSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument()
    expect(screen.queryByText('@octocat')).not.toBeInTheDocument()
  })

  it('cancels a pending authorization flow when Account Settings unmounts', async () => {
    const cancelAuthorization = vi.fn(async () => undefined)
    window.spacezero.github.getConnection = async () => ({ status: 'disconnected' })
    window.spacezero.github.startAuthorization = async () => ({
      flowId: 'flow-1',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-07-18T00:15:00.000Z'
    })
    window.spacezero.github.waitForAuthorization = () => new Promise<never>(() => undefined)
    window.spacezero.github.cancelAuthorization = cancelAuthorization

    const { unmount } = render(<AccountSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }))
    await screen.findByText('ABCD-EFGH')

    unmount()

    await waitFor(() => expect(cancelAuthorization).toHaveBeenCalledWith({ flowId: 'flow-1' }))
  })
})
