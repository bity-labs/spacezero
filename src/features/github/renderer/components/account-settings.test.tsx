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
})
