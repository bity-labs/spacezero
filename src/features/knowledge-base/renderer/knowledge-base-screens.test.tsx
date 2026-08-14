import { fireEvent, render, screen } from '@testing-library/react'

import { KnowledgeBaseConfiguredScreen } from './knowledge-base-configured-screen'
import { KnowledgeBaseSetupScreen } from './knowledge-base-setup-screen'
import { KnowledgeBaseUnavailableScreen } from './knowledge-base-unavailable-screen'

const setupProps = {
  loading: false,
  error: null,
  isCreating: false,
  isCloneFormOpen: false,
  isCloning: false,
  gitUrl: '',
  onCreateNew: vi.fn(),
  onOpenCloneForm: vi.fn(),
  onGitUrlChange: vi.fn(),
  onCancelClone: vi.fn(),
  onCloneFromGit: vi.fn()
}

describe('KnowledgeBaseSetupScreen', () => {
  it('shows loading without requiring the desktop runtime', () => {
    render(<KnowledgeBaseSetupScreen {...setupProps} loading />)

    expect(screen.getByText('Loading Knowledge Base…')).toBeInTheDocument()
  })

  it('renders setup state and emits create and clone intent', () => {
    const onCreateNew = vi.fn()
    const onOpenCloneForm = vi.fn()
    render(
      <KnowledgeBaseSetupScreen
        {...setupProps}
        onCreateNew={onCreateNew}
        onOpenCloneForm={onOpenCloneForm}
      />
    )

    expect(screen.getByRole('heading', { name: 'Set up your Knowledge Base' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create new' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone from Git repository' }))

    expect(onCreateNew).toHaveBeenCalledOnce()
    expect(onOpenCloneForm).toHaveBeenCalledOnce()
  })

  it('renders the controlled clone form and emits form intent', () => {
    const onGitUrlChange = vi.fn()
    const onCancelClone = vi.fn()
    const onCloneFromGit = vi.fn()
    render(
      <KnowledgeBaseSetupScreen
        {...setupProps}
        isCloneFormOpen
        gitUrl="https://github.com/builder/knowledge.git"
        onGitUrlChange={onGitUrlChange}
        onCancelClone={onCancelClone}
        onCloneFromGit={onCloneFromGit}
      />
    )

    fireEvent.change(screen.getByLabelText('Git repository URL'), {
      target: { value: 'git@github.com:builder/knowledge.git' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))

    expect(onGitUrlChange).toHaveBeenCalledWith('git@github.com:builder/knowledge.git')
    expect(onCancelClone).toHaveBeenCalledOnce()
    expect(onCloneFromGit).toHaveBeenCalledOnce()
  })

  it('renders setup errors and busy actions', () => {
    render(
      <KnowledgeBaseSetupScreen
        {...setupProps}
        error="The repository could not be cloned."
        isCreating
        isCloneFormOpen
        isCloning
        gitUrl="https://github.com/builder/knowledge.git"
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('The repository could not be cloned.')
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cloning…' })).toBeDisabled()
  })
})

describe('KnowledgeBaseUnavailableScreen', () => {
  it('explains an unavailable repository and emits recovery intent', () => {
    const onReconnect = vi.fn()
    const onResetConfiguration = vi.fn()
    render(
      <KnowledgeBaseUnavailableScreen
        rootPath="/Users/builder/SpaceZero/knowledge-base"
        reason="not-git-repository"
        error="The repository is still unavailable."
        isRecovering={false}
        onReconnect={onReconnect}
        onResetConfiguration={onResetConfiguration}
      />
    )

    expect(screen.getByText('The configured Knowledge Base path is no longer a Git repository.'))
    expect(screen.getByRole('alert')).toHaveTextContent('The repository is still unavailable.')
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset configuration' }))

    expect(onReconnect).toHaveBeenCalledOnce()
    expect(onResetConfiguration).toHaveBeenCalledOnce()
  })
})

describe('KnowledgeBaseConfiguredScreen', () => {
  it('renders configured content with warning and operation states', () => {
    render(
      <KnowledgeBaseConfiguredScreen
        setupWarning="The Git remote has not been configured."
        error="Unable to clear Knowledge Base Chat."
        isClearingChat
      >
        <div>Knowledge Base Chat</div>
      </KnowledgeBaseConfiguredScreen>
    )

    const alerts = screen.getAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('The Git remote has not been configured.')
    expect(alerts[1]).toHaveTextContent(
      'Unable to clear Knowledge Base Chat. Your previous chat is still current.'
    )
    expect(screen.getByRole('status')).toHaveTextContent('Starting a fresh Knowledge Base Chat…')
    expect(screen.getByText('Knowledge Base Chat')).toBeInTheDocument()
  })
})
