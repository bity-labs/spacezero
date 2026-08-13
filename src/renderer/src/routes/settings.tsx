import { createFileRoute } from '@tanstack/react-router'

import { SettingsLayout } from '../../../features/settings/renderer/settings-layout'
import type { SettingsSectionId } from '../../../features/settings/renderer/settings-navigation'

type SettingsSearch = {
  section?: SettingsSectionId
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const section = getSupportedSettingsSection(search.section)
    return section ? { section } : {}
  },
  component: SettingsRoute
})

function SettingsRoute(): React.JSX.Element {
  const { section } = Route.useSearch()

  return <SettingsLayout selectedSection={getSupportedSettingsSection(section) ?? 'general'} />
}

function getSupportedSettingsSection(section: unknown): SettingsSectionId | undefined {
  return section === 'models' ||
    section === 'account' ||
    section === 'appearance' ||
    section === 'about' ||
    section === 'agents' ||
    section === 'skills'
    ? section
    : undefined
}
