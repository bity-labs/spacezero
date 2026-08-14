import type { GeneralSettingsScreenProps } from './general-settings-screen'

const noOp = (): void => undefined

export const defaultGeneralSettingsFixture = {
  languageSettings: { preference: 'en', resolvedLanguage: 'en', systemLanguage: 'en-US' },
  languageError: false,
  onLanguagePreferenceChange: noOp,
  chatLinkSettings: { openChatLinksIn: 'space-zero-browser' },
  chatLinkError: false,
  onChatLinkDestinationChange: noOp,
  gitActionSettings: { primaryGitAction: 'commit-and-push' },
  gitActionError: false,
  onGitActionChange: noOp,
  storageSettings: {
    spaceZeroHome: '~/SpaceZero',
    projectsPath: '~/SpaceZero/projects',
    worktreesPath: '~/SpaceZero/worktrees'
  },
  isStorageChanging: false,
  storageError: false,
  onChooseSpaceZeroHome: noOp,
  terminalSettings: { confirmBeforeClosingLiveTerminals: true },
  isTerminalChanging: false,
  terminalError: false,
  onConfirmBeforeClosingLiveTerminalsChange: noOp,
  isBrowserDataConfirmOpen: false,
  isClearingBrowserData: false,
  browserDataMessage: null,
  onBrowserDataConfirmOpenChange: noOp,
  onClearBrowserData: noOp
} satisfies GeneralSettingsScreenProps

export const loadingErrorGeneralSettingsFixture = {
  ...defaultGeneralSettingsFixture,
  languageSettings: null,
  languageError: true,
  chatLinkSettings: null,
  chatLinkError: true,
  gitActionSettings: null,
  gitActionError: true,
  storageSettings: null,
  isStorageChanging: true,
  storageError: true,
  terminalSettings: null,
  terminalError: true,
  browserDataMessage: {
    kind: 'error',
    text: 'Browser data could not be cleared. Try again.'
  }
} satisfies GeneralSettingsScreenProps
