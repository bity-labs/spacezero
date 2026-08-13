import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { BrowserClearDataCategory } from '../../../browser/shared'
import type { ChatLinkDestination, ChatLinkSettings } from '@shared/chat-link-settings'
import type { GitActionSettings, GitComposerAction } from '@shared/git-action-settings'
import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import type { StorageSettings } from '@shared/storage-settings'
import type { TerminalSettings } from '@shared/terminal-settings'

import { GeneralSettingsScreen } from '../screens/general-settings-screen'

type GeneralSettingsPageProps = {
  languageSettings: LanguageSettings | null
  languageError: boolean
  onLanguagePreferenceChange: (preference: LanguagePreference) => Promise<void>
}

type BrowserDataMessage = { kind: 'success' | 'error'; text: string }

export function GeneralSettingsPage({
  languageSettings,
  languageError,
  onLanguagePreferenceChange
}: GeneralSettingsPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const [chatLinkSettings, setChatLinkSettings] = useState<ChatLinkSettings | null>(null)
  const [chatLinkError, setChatLinkError] = useState(false)
  const [gitActionSettings, setGitActionSettings] = useState<GitActionSettings | null>(null)
  const [gitActionError, setGitActionError] = useState(false)
  const [storageSettings, setStorageSettings] = useState<StorageSettings | null>(null)
  const [isStorageChanging, setIsStorageChanging] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings | null>(null)
  const [isTerminalChanging, setIsTerminalChanging] = useState(false)
  const [terminalError, setTerminalError] = useState(false)
  const [isBrowserDataConfirmOpen, setIsBrowserDataConfirmOpen] = useState(false)
  const [isClearingBrowserData, setIsClearingBrowserData] = useState(false)
  const [browserDataMessage, setBrowserDataMessage] = useState<BrowserDataMessage | null>(null)

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getChatLinkSettings()
      .then((settings) => {
        if (!isCurrent) return
        setChatLinkSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setChatLinkError(true)
      })

    window.spacezero.settings
      .getGitActionSettings()
      .then((settings) => {
        if (!isCurrent) return
        setGitActionSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setGitActionError(true)
      })

    window.spacezero.settings
      .getStorageSettings()
      .then((settings) => {
        if (!isCurrent) return
        setStorageSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setStorageError(true)
      })

    window.spacezero.settings
      .getTerminalSettings()
      .then((settings) => {
        if (!isCurrent) return
        setTerminalSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setTerminalError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleChatLinkDestinationChange(destination: ChatLinkDestination): Promise<void> {
    setChatLinkError(false)

    try {
      const settings = await window.spacezero.settings.updateChatLinkSettings({
        openChatLinksIn: destination
      })
      setChatLinkSettings(settings)
    } catch {
      setChatLinkError(true)
    }
  }

  async function handleGitActionChange(primaryGitAction: GitComposerAction): Promise<void> {
    setGitActionError(false)

    try {
      const settings = await window.spacezero.settings.updateGitActionSettings({
        primaryGitAction
      })
      setGitActionSettings(settings)
    } catch {
      setGitActionError(true)
    }
  }

  async function handleChooseSpaceZeroHome(): Promise<void> {
    setIsStorageChanging(true)
    setStorageError(false)

    try {
      const nextSettings = await window.spacezero.settings.chooseSpaceZeroHome()
      if (nextSettings) setStorageSettings(nextSettings)
    } catch {
      setStorageError(true)
    } finally {
      setIsStorageChanging(false)
    }
  }

  async function updateConfirmBeforeClosingLiveTerminals(nextValue: boolean): Promise<void> {
    if (!terminalSettings || isTerminalChanging) return
    setIsTerminalChanging(true)
    setTerminalError(false)

    try {
      const updated = await window.spacezero.settings.updateTerminalSettings({
        confirmBeforeClosingLiveTerminals: nextValue
      })
      setTerminalSettings(updated)
    } catch {
      setTerminalError(true)
    } finally {
      setIsTerminalChanging(false)
    }
  }

  async function confirmClearBrowserData(): Promise<void> {
    if (isClearingBrowserData) return
    setIsClearingBrowserData(true)
    setBrowserDataMessage(null)

    try {
      const result = await window.spacezero.browser.clearData()
      setIsBrowserDataConfirmOpen(false)
      if (result.status === 'cleared') {
        setBrowserDataMessage({ kind: 'success', text: t('settings.browserData.success') })
      } else {
        const failedCategories = result.failures
          .map((failure) => browserDataCategoryLabel(failure.category, t))
          .join(', ')
        setBrowserDataMessage({
          kind: 'error',
          text: t('settings.browserData.failure', { categories: failedCategories })
        })
      }
    } catch {
      setBrowserDataMessage({
        kind: 'error',
        text: t('settings.browserData.unexpectedFailure')
      })
    } finally {
      setIsClearingBrowserData(false)
    }
  }

  return (
    <GeneralSettingsScreen
      languageSettings={languageSettings}
      languageError={languageError}
      onLanguagePreferenceChange={(preference) => void onLanguagePreferenceChange(preference)}
      chatLinkSettings={chatLinkSettings}
      chatLinkError={chatLinkError}
      onChatLinkDestinationChange={(destination) =>
        void handleChatLinkDestinationChange(destination)
      }
      gitActionSettings={gitActionSettings}
      gitActionError={gitActionError}
      onGitActionChange={(action) => void handleGitActionChange(action)}
      storageSettings={storageSettings}
      isStorageChanging={isStorageChanging}
      storageError={storageError}
      onChooseSpaceZeroHome={() => void handleChooseSpaceZeroHome()}
      terminalSettings={terminalSettings}
      isTerminalChanging={isTerminalChanging}
      terminalError={terminalError}
      onConfirmBeforeClosingLiveTerminalsChange={(nextValue) =>
        void updateConfirmBeforeClosingLiveTerminals(nextValue)
      }
      isBrowserDataConfirmOpen={isBrowserDataConfirmOpen}
      isClearingBrowserData={isClearingBrowserData}
      browserDataMessage={browserDataMessage}
      onBrowserDataConfirmOpenChange={setIsBrowserDataConfirmOpen}
      onClearBrowserData={() => void confirmClearBrowserData()}
    />
  )
}

function browserDataCategoryLabel(
  category: BrowserClearDataCategory,
  t: ReturnType<typeof useTranslation>['t']
): string {
  switch (category) {
    case 'cookies-and-site-storage':
      return t('settings.browserData.categories.cookiesAndSiteStorage')
    case 'cache':
      return t('settings.browserData.categories.cache')
    case 'temporary-grants':
      return t('settings.browserData.categories.temporaryGrants')
  }
}
