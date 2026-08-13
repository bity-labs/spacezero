import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GeneralSettingsScreen, type GeneralSettingsScreenProps } from './general-settings-screen'

function createProps(
  overrides: Partial<GeneralSettingsScreenProps> = {}
): GeneralSettingsScreenProps {
  return {
    languageSettings: { preference: 'en', resolvedLanguage: 'en', systemLanguage: 'en-US' },
    languageError: false,
    onLanguagePreferenceChange: vi.fn(),
    chatLinkSettings: { openChatLinksIn: 'default-browser' },
    chatLinkError: false,
    onChatLinkDestinationChange: vi.fn(),
    gitActionSettings: { primaryGitAction: 'commit' },
    gitActionError: false,
    onGitActionChange: vi.fn(),
    storageSettings: {
      spaceZeroHome: '/Users/builder/SpaceZero',
      projectsPath: '/Users/builder/SpaceZero/projects',
      worktreesPath: '/Users/builder/SpaceZero/worktrees'
    },
    isStorageChanging: false,
    storageError: false,
    onChooseSpaceZeroHome: vi.fn(),
    terminalSettings: { confirmBeforeClosingLiveTerminals: false },
    isTerminalChanging: false,
    terminalError: false,
    onConfirmBeforeClosingLiveTerminalsChange: vi.fn(),
    isBrowserDataConfirmOpen: false,
    isClearingBrowserData: false,
    browserDataMessage: null,
    onBrowserDataConfirmOpenChange: vi.fn(),
    onClearBrowserData: vi.fn(),
    ...overrides
  }
}

describe('GeneralSettingsScreen', () => {
  it('renders supplied settings and delegates user actions through callbacks', async () => {
    const user = userEvent.setup()
    const onChooseSpaceZeroHome = vi.fn()
    const onConfirmBeforeClosingLiveTerminalsChange = vi.fn()
    const onBrowserDataConfirmOpenChange = vi.fn()

    render(
      <GeneralSettingsScreen
        {...createProps({
          onChooseSpaceZeroHome,
          onConfirmBeforeClosingLiveTerminalsChange,
          onBrowserDataConfirmOpenChange
        })}
      />
    )

    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveTextContent('English')
    expect(screen.getByRole('combobox', { name: 'Open chat links in' })).toHaveTextContent(
      'Default browser'
    )
    expect(screen.getByRole('combobox', { name: 'Primary Git action' })).toHaveTextContent('Commit')
    expect(screen.getByText('/Users/builder/SpaceZero')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(onChooseSpaceZeroHome).toHaveBeenCalledOnce()

    await user.click(
      screen.getByRole('switch', { name: 'Confirm before terminating live terminals' })
    )
    expect(onConfirmBeforeClosingLiveTerminalsChange).toHaveBeenCalledWith(true)

    await user.click(screen.getByRole('button', { name: 'Clear Browser Data' }))
    expect(onBrowserDataConfirmOpenChange).toHaveBeenCalledWith(true)
  })
})
