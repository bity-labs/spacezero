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

export type GeneralSettingsScreenProps = {
  languageSettings: LanguageSettings | null
  languageError: boolean
  onLanguagePreferenceChange: (preference: LanguagePreference) => void
  chatLinkSettings: ChatLinkSettings | null
  chatLinkError: boolean
  onChatLinkDestinationChange: (destination: ChatLinkDestination) => void
  gitActionSettings: GitActionSettings | null
  gitActionError: boolean
  onGitActionChange: (action: GitComposerAction) => void
  storageSettings: StorageSettings | null
  isStorageChanging: boolean
  storageError: boolean
  onChooseSpaceZeroHome: () => void
  terminalSettings: TerminalSettings | null
  isTerminalChanging: boolean
  terminalError: boolean
  onConfirmBeforeClosingLiveTerminalsChange: (nextValue: boolean) => void
  isBrowserDataConfirmOpen: boolean
  isClearingBrowserData: boolean
  browserDataMessage: { kind: 'success' | 'error'; text: string } | null
  onBrowserDataConfirmOpenChange: (open: boolean) => void
  onClearBrowserData: () => void
}

export function GeneralSettingsScreen({
  languageSettings,
  languageError,
  onLanguagePreferenceChange,
  chatLinkSettings,
  chatLinkError,
  onChatLinkDestinationChange,
  gitActionSettings,
  gitActionError,
  onGitActionChange,
  storageSettings,
  isStorageChanging,
  storageError,
  onChooseSpaceZeroHome,
  terminalSettings,
  isTerminalChanging,
  terminalError,
  onConfirmBeforeClosingLiveTerminalsChange,
  isBrowserDataConfirmOpen,
  isClearingBrowserData,
  browserDataMessage,
  onBrowserDataConfirmOpenChange,
  onClearBrowserData
}: GeneralSettingsScreenProps): React.JSX.Element {
  const { t } = useTranslation()

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
              onValueChange={(value) => onLanguagePreferenceChange(value as LanguagePreference)}
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
              onValueChange={(value) => onChatLinkDestinationChange(value as ChatLinkDestination)}
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
              onValueChange={(value) => onGitActionChange(value as GitComposerAction)}
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
                disabled={!storageSettings || isStorageChanging}
                aria-label={
                  isStorageChanging ? t('settings.storage.changing') : t('settings.storage.change')
                }
                onClick={onChooseSpaceZeroHome}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </SettingsRow>
          {storageError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.storage.error')}
            </Text>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('settings.terminal.sectionTitle')}>
          <SettingsRow
            title={t('settings.terminal.confirmBeforeClosingLiveTerminals.label')}
            description={t('settings.terminal.confirmBeforeClosingLiveTerminals.description')}
          >
            <Switch
              aria-label={t('settings.terminal.confirmBeforeClosingLiveTerminals.label')}
              checked={terminalSettings?.confirmBeforeClosingLiveTerminals ?? true}
              disabled={!terminalSettings || isTerminalChanging}
              onCheckedChange={(checked) =>
                onConfirmBeforeClosingLiveTerminalsChange(Boolean(checked))
              }
            />
          </SettingsRow>
          {!terminalSettings ? (
            <Text variant="muted" className="px-4 pb-3">
              {t('settings.terminal.loading')}
            </Text>
          ) : null}
          {terminalError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.terminal.saveError')}
            </Text>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('settings.browserData.sectionTitle')}>
          <SettingsRow
            title={t('settings.browserData.clearAction')}
            description={t('settings.browserData.description')}
          >
            <Button
              variant="destructive"
              size="sm"
              disabled={isClearingBrowserData}
              onClick={() => onBrowserDataConfirmOpenChange(true)}
            >
              {isClearingBrowserData
                ? t('settings.browserData.clearing')
                : t('settings.browserData.clearAction')}
            </Button>
          </SettingsRow>
          {browserDataMessage ? (
            <Text
              role="status"
              variant={browserDataMessage.kind === 'error' ? 'danger' : 'muted'}
              className="px-4 pb-3"
            >
              {browserDataMessage.text}
            </Text>
          ) : null}
          <Dialog
            open={isBrowserDataConfirmOpen}
            onOpenChange={(open) => {
              if (!isClearingBrowserData) onBrowserDataConfirmOpenChange(open)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.browserData.confirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('settings.browserData.confirmDescription')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={isClearingBrowserData}
                  onClick={() => onBrowserDataConfirmOpenChange(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  disabled={isClearingBrowserData}
                  onClick={onClearBrowserData}
                >
                  {isClearingBrowserData
                    ? t('settings.browserData.clearing')
                    : t('settings.browserData.confirmAction')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SettingsSection>
      </div>
    </>
  )
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
  if (action === 'commit-and-create-pr') return t('settings.gitPrimaryAction.commitAndCreatePr')
  return t('settings.gitPrimaryAction.commitAndPush')
}
