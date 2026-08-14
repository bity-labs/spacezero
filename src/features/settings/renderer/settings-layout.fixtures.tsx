import { GitHubAccountSettingsScreen } from '../../github/renderer/components/github-account-settings-screen'
import { connectedGitHubAccountFixture } from '../../github/renderer/components/github-account-settings-screen.fixtures'
import { AccountMenuView } from '@renderer/components/app-shell/account-menu-view'
import { connectedAccountMenuFixture } from '@renderer/components/app-shell/account-menu-view.fixtures'
import { AccountSettingsScreen } from './screens/account-settings-screen'
import { GeneralSettingsScreen } from './screens/general-settings-screen'
import { defaultGeneralSettingsFixture } from './screens/general-settings-screen.fixtures'
import { ModelsSettingsScreen } from './screens/models-settings-screen'
import { connectedModelsSettingsFixture } from './screens/models-settings-screen.fixtures'
import type { SettingsLayoutViewProps } from './settings-layout-view'

const noOp = (): void => undefined

const labels: SettingsLayoutViewProps['labels'] = {
  backToWorkspace: 'Back to workspace',
  navigation: 'Settings navigation',
  experimentalNavigation: 'Experimental settings',
  main: 'Settings content',
  title: 'Settings',
  resizeSidebar: 'Resize settings sidebar',
  sections: {
    general: 'General',
    models: 'Providers',
    account: 'Account',
    appearance: 'Appearance',
    about: 'About',
    agents: 'Agents',
    skills: 'Skills'
  }
}

function fixture({
  selectedSection,
  mainContent
}: Pick<SettingsLayoutViewProps, 'selectedSection' | 'mainContent'>): SettingsLayoutViewProps {
  return {
    sidebarWidth: 280,
    selectedSection,
    accountMenu: (
      <AccountMenuView {...connectedAccountMenuFixture} settingsLabel="Close settings" />
    ),
    mainContent,
    labels,
    onBackToWorkspace: noOp,
    onSelectSection: noOp,
    onResizePointerDown: noOp,
    onResizeKeyDown: noOp
  }
}

export const generalSettingsLayoutFixture = fixture({
  selectedSection: 'general',
  mainContent: <GeneralSettingsScreen {...defaultGeneralSettingsFixture} />
})

export const modelsSettingsLayoutFixture = fixture({
  selectedSection: 'models',
  mainContent: <ModelsSettingsScreen {...connectedModelsSettingsFixture} />
})

export const githubAccountSettingsLayoutFixture = fixture({
  selectedSection: 'account',
  mainContent: (
    <AccountSettingsScreen
      githubAccount={<GitHubAccountSettingsScreen {...connectedGitHubAccountFixture} />}
    />
  )
})
