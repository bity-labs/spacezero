import { useEffect, useState } from 'react'
import { FolderOpen } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { ChatLinkDestination, ChatLinkSettings } from '@shared/chat-link-settings'
import type { GitActionSettings, GitComposerAction } from '@shared/git-action-settings'
import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import type { StorageSettings } from '@shared/storage-settings'
import type { TerminalSettings } from '@shared/terminal-settings'

import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Text } from '@renderer/components/ui/typography'
import { SettingsPageHeader } from '../components/settings-page-header'
import { SettingsRow } from '../components/settings-row'
import { SettingsSection } from '../components/settings-section'

type GeneralSettingsPageProps = {
  languageSettings: LanguageSettings | null
  languageError: boolean
  onLanguagePreferenceChange: (preference: LanguagePreference) => Promise<void>
}

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

  return (
    <>
      <SettingsPageHeader title={t('settings.navigation.general')} />

      <div className="space-y-8">
        <SettingsSection title={t('settings.preferences.sectionTitle')}>
          <SettingsRow
            title={t('settings.language.label')}
            description={t('settings.language.description')}
          >
            <Select
              value={languageSettings?.preference ?? 'system'}
              onValueChange={(value) =>
                void onLanguagePreferenceChange(value as LanguagePreference)
              }
              disabled={!languageSettings}
            >
              <SelectTrigger size="sm" className="w-40" aria-label={t('settings.language.label')}>
                <SelectValue>
                  {(value: LanguagePreference) => getLanguagePreferenceLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('settings.language.useSystem')}</SelectItem>
                <SelectItem value="en">{t('settings.language.english')}</SelectItem>
                <SelectItem value="fr">{t('settings.language.french')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {!languageSettings ? (
            <Text variant="muted" className="px-4 pb-3">
              {t('settings.language.loading')}
            </Text>
          ) : null}
          {languageError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.language.saveError')}
            </Text>
          ) : null}
          <SettingsRow
            title={t('settings.chatLinks.label')}
            description={t('settings.chatLinks.description')}
          >
            <Select
              value={chatLinkSettings?.openChatLinksIn ?? 'space-zero-browser'}
              onValueChange={(value) =>
                void handleChatLinkDestinationChange(value as ChatLinkDestination)
              }
              disabled={!chatLinkSettings}
            >
              <SelectTrigger size="sm" className="w-48" aria-label={t('settings.chatLinks.label')}>
                <SelectValue>
                  {(value: ChatLinkDestination) => getChatLinkDestinationLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="space-zero-browser">
                  {t('settings.chatLinks.spaceZeroBrowser')}
                </SelectItem>
                <SelectItem value="default-browser">
                  {t('settings.chatLinks.defaultBrowser')}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {!chatLinkSettings ? (
            <Text variant="muted" className="px-4 pb-3">
              {t('settings.chatLinks.loading')}
            </Text>
          ) : null}
          {chatLinkError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.chatLinks.saveError')}
            </Text>
          ) : null}
          <SettingsRow
            title={t('settings.gitPrimaryAction.label')}
            description={t('settings.gitPrimaryAction.description')}
          >
            <Select
              value={gitActionSettings?.primaryGitAction ?? 'commit-and-push'}
              onValueChange={(value) => void handleGitActionChange(value as GitComposerAction)}
              disabled={!gitActionSettings}
            >
              <SelectTrigger
                size="sm"
                className="w-44"
                aria-label={t('settings.gitPrimaryAction.label')}
              >
                <SelectValue>
                  {(value: GitComposerAction) => getGitActionLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="commit">{t('settings.gitPrimaryAction.commit')}</SelectItem>
                <SelectItem value="commit-and-push">
                  {t('settings.gitPrimaryAction.commitAndPush')}
                </SelectItem>
                <SelectItem value="commit-and-create-pr">
                  {t('settings.gitPrimaryAction.commitAndCreatePr')}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {!gitActionSettings ? (
            <Text variant="muted" className="px-4 pb-3">
              {t('settings.gitPrimaryAction.loading')}
            </Text>
          ) : null}
          {gitActionError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.gitPrimaryAction.saveError')}
            </Text>
          ) : null}
        </SettingsSection>

        <StorageSettingsSection />

        <TerminalSafetySettingsSection />

        <BrowserDataSettingsSection />
      </div>
    </>
  )
}

function BrowserDataSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function confirmClearBrowserData(): Promise<void> {
    if (isClearing) return
    setIsClearing(true)
    setMessage(null)

    try {
      const result = await window.spacezero.browser.clearData()
      setIsConfirmOpen(false)
      if (result.status === 'cleared') {
        setMessage({ kind: 'success', text: t('settings.browserData.success') })
      } else {
        const failedCategories = result.failures
          .map((failure) => browserDataCategoryLabel(failure.category, t))
          .join(', ')
        setMessage({
          kind: 'error',
          text: t('settings.browserData.failure', { categories: failedCategories })
        })
      }
    } catch {
      setMessage({ kind: 'error', text: t('settings.browserData.unexpectedFailure') })
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <SettingsSection title={t('settings.browserData.sectionTitle')}>
      <SettingsRow
        title={t('settings.browserData.clearAction')}
        description={t('settings.browserData.description')}
      >
        <Button
          variant="destructive"
          size="sm"
          disabled={isClearing}
          onClick={() => setIsConfirmOpen(true)}
        >
          {isClearing ? t('settings.browserData.clearing') : t('settings.browserData.clearAction')}
        </Button>
      </SettingsRow>
      {message ? (
        <Text
          role="status"
          variant={message.kind === 'error' ? 'danger' : 'muted'}
          className="px-4 pb-3"
        >
          {message.text}
        </Text>
      ) : null}
      <Dialog open={isConfirmOpen} onOpenChange={(open) => !isClearing && setIsConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.browserData.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('settings.browserData.confirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isClearing} onClick={() => setIsConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={isClearing}
              onClick={() => void confirmClearBrowserData()}
            >
              {isClearing
                ? t('settings.browserData.clearing')
                : t('settings.browserData.confirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}

function TerminalSafetySettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings | null>(null)
  const [isChanging, setIsChanging] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getTerminalSettings()
      .then((settings) => {
        if (!isCurrent) return
        setTerminalSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function updateConfirmBeforeClosingLiveTerminals(nextValue: boolean): Promise<void> {
    if (!terminalSettings || isChanging) return
    setIsChanging(true)
    setError(false)
    try {
      const updated = await window.spacezero.settings.updateTerminalSettings({
        confirmBeforeClosingLiveTerminals: nextValue
      })
      setTerminalSettings(updated)
    } catch {
      setError(true)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <SettingsSection title={t('settings.terminal.sectionTitle')}>
      <SettingsRow
        title={t('settings.terminal.confirmBeforeClosingLiveTerminals.label')}
        description={t('settings.terminal.confirmBeforeClosingLiveTerminals.description')}
      >
        <Switch
          aria-label={t('settings.terminal.confirmBeforeClosingLiveTerminals.label')}
          checked={terminalSettings?.confirmBeforeClosingLiveTerminals ?? true}
          disabled={!terminalSettings || isChanging}
          onCheckedChange={(checked) =>
            void updateConfirmBeforeClosingLiveTerminals(Boolean(checked))
          }
        />
      </SettingsRow>
      {!terminalSettings ? (
        <Text variant="muted" className="px-4 pb-3">
          {t('settings.terminal.loading')}
        </Text>
      ) : null}
      {error ? (
        <Text variant="danger" className="px-4 pb-3">
          {t('settings.terminal.saveError')}
        </Text>
      ) : null}
    </SettingsSection>
  )
}

function StorageSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [storageSettings, setStorageSettings] = useState<StorageSettings | null>(null)
  const [isChanging, setIsChanging] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getStorageSettings()
      .then((settings) => {
        if (!isCurrent) return
        setStorageSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleChooseSpaceZeroHome(): Promise<void> {
    setIsChanging(true)
    setError(false)

    try {
      const nextSettings = await window.spacezero.settings.chooseSpaceZeroHome()
      if (nextSettings) setStorageSettings(nextSettings)
    } catch {
      setError(true)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <SettingsSection title={t('settings.storage.sectionTitle')}>
      <SettingsRow
        title={t('settings.storage.spaceZeroHome')}
        description={t('settings.storage.spaceZeroHomeDescription')}
      >
        <div className="flex max-w-[360px] items-center gap-3">
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={storageSettings?.spaceZeroHome}
          >
            {storageSettings?.spaceZeroHome ?? t('settings.storage.loading')}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            disabled={!storageSettings || isChanging}
            aria-label={isChanging ? t('settings.storage.changing') : t('settings.storage.change')}
            onClick={() => void handleChooseSpaceZeroHome()}
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </SettingsRow>
      {error ? (
        <Text variant="danger" className="px-4 pb-3">
          {t('settings.storage.error')}
        </Text>
      ) : null}
    </SettingsSection>
  )
}

function browserDataCategoryLabel(
  category: 'cookies-and-site-storage' | 'cache' | 'temporary-grants',
  t: (key: string) => string
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

function getLanguagePreferenceLabel(
  preference: LanguagePreference,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (preference === 'system') return t('settings.language.useSystem')
  if (preference === 'fr') return t('settings.language.french')
  return t('settings.language.english')
}

function getChatLinkDestinationLabel(
  destination: ChatLinkDestination,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (destination === 'default-browser') return t('settings.chatLinks.defaultBrowser')
  return t('settings.chatLinks.spaceZeroBrowser')
}

function getGitActionLabel(
  action: GitComposerAction,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (action === 'commit') return t('settings.gitPrimaryAction.commit')
  if (action === 'commit-and-create-pr') {
    return t('settings.gitPrimaryAction.commitAndCreatePr')
  }
  return t('settings.gitPrimaryAction.commitAndPush')
}
