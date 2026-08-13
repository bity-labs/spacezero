import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GeneralSettingsPage } from './general-settings-page'

describe('GeneralSettingsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads and saves settings through the app preload bridge', async () => {
    const user = userEvent.setup()
    const getTerminalSettings = vi
      .spyOn(window.spacezero.settings, 'getTerminalSettings')
      .mockResolvedValue({ confirmBeforeClosingLiveTerminals: true })
    const updateTerminalSettings = vi
      .spyOn(window.spacezero.settings, 'updateTerminalSettings')
      .mockResolvedValue({ confirmBeforeClosingLiveTerminals: false })

    render(
      <GeneralSettingsPage
        languageSettings={{ preference: 'en', resolvedLanguage: 'en', systemLanguage: 'en-US' }}
        languageError={false}
        onLanguagePreferenceChange={vi.fn()}
      />
    )

    const terminalSafety = await screen.findByRole('switch', {
      name: 'Confirm before terminating live terminals'
    })
    await waitFor(() => expect(terminalSafety).toBeEnabled())
    expect(getTerminalSettings).toHaveBeenCalledOnce()

    await user.click(terminalSafety)

    await waitFor(() =>
      expect(updateTerminalSettings).toHaveBeenCalledWith({
        confirmBeforeClosingLiveTerminals: false
      })
    )
    await waitFor(() => expect(terminalSafety).not.toBeChecked())
  })

  it('renders app loading failures as screen error state', async () => {
    vi.spyOn(window.spacezero.settings, 'getChatLinkSettings').mockRejectedValue(
      new Error('settings unavailable')
    )

    render(
      <GeneralSettingsPage
        languageSettings={{ preference: 'en', resolvedLanguage: 'en', systemLanguage: 'en-US' }}
        languageError={false}
        onLanguagePreferenceChange={vi.fn()}
      />
    )

    expect(await screen.findByText('Unable to save the chat link preference.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Open chat links in' })).toBeDisabled()
  })
})
