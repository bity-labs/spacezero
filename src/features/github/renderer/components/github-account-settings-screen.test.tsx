import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { GitHubAccountSettingsScreenProps } from './github-account-settings-screen'
import { GitHubAccountSettingsScreen } from './github-account-settings-screen'

function createProps(
  overrides: Partial<GitHubAccountSettingsScreenProps> = {}
): GitHubAccountSettingsScreenProps {
  return {
    connection: { status: 'disconnected' },
    isLoading: false,
    error: null,
    authorization: null,
    copied: false,
    onStartAuthorization: vi.fn(),
    onCancelAuthorization: vi.fn(),
    onCopyCode: vi.fn(),
    onOpenAuthorization: vi.fn(),
    onOpenInstallation: vi.fn(),
    onCheckRepositoryAccess: vi.fn(),
    onOpenManageAccess: vi.fn(),
    onDisconnect: vi.fn(),
    ...overrides
  }
}

describe('GitHubAccountSettingsScreen', () => {
  it('renders disconnected state and delegates connection intent', async () => {
    const user = userEvent.setup()
    const onStartAuthorization = vi.fn()

    render(<GitHubAccountSettingsScreen {...createProps({ onStartAuthorization })} />)

    await user.click(screen.getByRole('button', { name: 'Connect GitHub' }))
    expect(onStartAuthorization).toHaveBeenCalledOnce()
  })

  it('renders device-code state and delegates its actions', async () => {
    const user = userEvent.setup()
    const onCopyCode = vi.fn()
    const onOpenAuthorization = vi.fn()
    const onCancelAuthorization = vi.fn()

    render(
      <GitHubAccountSettingsScreen
        {...createProps({
          authorization: {
            flowId: 'flow-1',
            userCode: 'ABCD-EFGH',
            verificationUri: 'https://github.com/login/device',
            expiresAt: '2026-07-18T00:15:00.000Z'
          },
          onCopyCode,
          onOpenAuthorization,
          onCancelAuthorization
        })}
      />
    )

    expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    await user.click(screen.getByRole('button', { name: 'Open GitHub' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCopyCode).toHaveBeenCalledOnce()
    expect(onOpenAuthorization).toHaveBeenCalledOnce()
    expect(onCancelAuthorization).toHaveBeenCalledOnce()
  })

  it('renders connected and error states from props', () => {
    render(
      <GitHubAccountSettingsScreen
        {...createProps({
          connection: {
            status: 'connected',
            identity: {
              id: '42',
              login: 'octocat',
              avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
              profileUrl: 'https://github.com/octocat'
            },
            installations: [],
            repositories: []
          },
          error: 'Unable to refresh GitHub.'
        })}
      />
    )

    expect(screen.getByText('@octocat')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to refresh GitHub.')
  })
})
