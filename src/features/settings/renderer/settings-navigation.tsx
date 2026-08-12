import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Cube, GearSix, Info, Sparkle, UserCircle } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@renderer/components/ui/sidebar'

export type SettingsSectionId =
  'general' | 'models' | 'account' | 'appearance' | 'about' | 'agents' | 'skills' | 'debug'

type SettingsNavigationDefinition = {
  id: SettingsSectionId
  translationKey: string
  icon: React.ComponentType<{ className?: string }>
}

type SettingsNavigationEntry = SettingsNavigationDefinition & {
  label: string
}

const primarySettingsNavigation = [
  { id: 'general', translationKey: 'general', icon: GearSix },
  { id: 'models', translationKey: 'models', icon: Cube },
  { id: 'account', translationKey: 'account', icon: UserCircle },
  { id: 'appearance', translationKey: 'appearance', icon: GearSix },
  { id: 'about', translationKey: 'about', icon: Info }
] as const satisfies ReadonlyArray<SettingsNavigationDefinition>

const secondarySettingsNavigation = [
  { id: 'agents', translationKey: 'agents', icon: UserCircle },
  { id: 'skills', translationKey: 'skills', icon: Sparkle },
  { id: 'debug', translationKey: 'debug', icon: GearSix }
] as const satisfies ReadonlyArray<SettingsNavigationDefinition>

export function SettingsNavigation({
  selectedSection
}: {
  selectedSection: SettingsSectionId
}): React.JSX.Element {
  const { t } = useTranslation()
  const primaryNavigationItems = useMemo(
    () =>
      primarySettingsNavigation.map((item) => ({ ...item, label: getSettingsNavLabel(item, t) })),
    [t]
  )
  const secondaryNavigationItems = useMemo(
    () =>
      secondarySettingsNavigation.map((item) => ({ ...item, label: getSettingsNavLabel(item, t) })),
    [t]
  )

  return (
    <>
      <SidebarMenu aria-label={t('settings.navigationLabel')}>
        {primaryNavigationItems.map((item) => (
          <SettingsNavigationItem key={item.id} item={item} selectedSection={selectedSection} />
        ))}
      </SidebarMenu>

      <div className="my-4 border-t border-sidebar-border" />

      <SidebarMenu aria-label="Experimental settings">
        {secondaryNavigationItems.map((item) => (
          <SettingsNavigationItem key={item.id} item={item} selectedSection={selectedSection} />
        ))}
      </SidebarMenu>
    </>
  )
}

function getSettingsNavLabel(
  item: { id: SettingsSectionId; translationKey: string },
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (item.id === 'appearance') return 'Appearance'
  if (item.id === 'debug') return 'UI Debug'
  return t(`settings.navigation.${item.translationKey}`)
}

function SettingsNavigationItem({
  item,
  selectedSection
}: {
  item: SettingsNavigationEntry
  selectedSection: SettingsSectionId
}): React.JSX.Element {
  const Icon = item.icon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to="/settings" search={item.id === 'general' ? {} : { section: item.id }} />}
        isActive={selectedSection === item.id}
        className="text-muted-foreground"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
