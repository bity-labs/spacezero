import { AccountSettings } from '../../../github/renderer'
import { AccountSettingsScreen } from '../screens/account-settings-screen'

export function AccountSettingsPage(): React.JSX.Element {
  return <AccountSettingsScreen githubAccount={<AccountSettings />} />
}
