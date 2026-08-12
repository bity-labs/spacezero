import { createFileRoute } from '@tanstack/react-router'

import { SettingsLayout } from '../../../features/settings/renderer/settings-layout'
import type { SettingsSectionId } from '../../../features/settings/renderer/settings-navigation'

type SettingsSearch = {
  section?: SettingsSectionId
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch =>
    search.section === 'models' ||
    search.section === 'account' ||
    search.section === 'appearance' ||
    search.section === 'about' ||
    search.section === 'agents' ||
    search.section === 'skills' ||
    search.section === 'debug'
      ? { section: search.section }
      : {},
  component: SettingsRoute
})

function SettingsRoute(): React.JSX.Element {
  const { section } = Route.useSearch()

  return <SettingsLayout selectedSection={section ?? 'general'} />
}
