import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { ArrowLeft, Cube, GearSix, Info, Sparkle, UserCircle } from '@phosphor-icons/react'

import { AppSidebar } from '@renderer/components/sidebar/app-sidebar'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@renderer/components/sidebar/sidebar-layout'
import { SidebarResizeHandle } from '@renderer/components/sidebar/sidebar-resize-handle'
import { buttonVariants } from '@renderer/components/ui/button'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@renderer/components/ui/sidebar'
import type { SettingsSectionId } from './settings-navigation'

const primarySettingsNavigation = [
  { id: 'general', icon: GearSix },
  { id: 'models', icon: Cube },
  { id: 'account', icon: UserCircle },
  { id: 'appearance', icon: GearSix },
  { id: 'about', icon: Info }
] as const

const secondarySettingsNavigation = [
  { id: 'agents', icon: UserCircle },
  { id: 'skills', icon: Sparkle }
] as const

export type SettingsLayoutViewLabels = {
  backToWorkspace: string
  navigation: string
  experimentalNavigation: string
  main: string
  title: string
  resizeSidebar: string
  sections: Record<SettingsSectionId, string>
}

export type SettingsLayoutViewProps = {
  sidebarWidth: number
  selectedSection: SettingsSectionId
  accountMenu: ReactNode
  mainContent: ReactNode
  labels: SettingsLayoutViewLabels
  onBackToWorkspace: () => void
  onSelectSection: (section: SettingsSectionId) => void
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function SettingsLayoutView({
  sidebarWidth,
  selectedSection,
  accountMenu,
  mainContent,
  labels,
  onBackToWorkspace,
  onSelectSection,
  onResizePointerDown,
  onResizeKeyDown
}: SettingsLayoutViewProps): React.JSX.Element {
  return (
    <div className="flex h-screen min-h-screen bg-background text-foreground">
      <AppSidebar
        className="app-titlebar shrink-0"
        style={{ width: `${sidebarWidth}px` }}
        contentClassName="titlebar-control flex flex-col px-2"
        header={
          <div className="flex h-12 items-center px-3">
            <div className="mac-traffic-light-space shrink-0" />
          </div>
        }
        footer={accountMenu}
      >
        <a
          href="#/"
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'mb-5 w-full justify-start gap-2 text-muted-foreground'
          })}
          onClick={(event) => {
            event.preventDefault()
            onBackToWorkspace()
          }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {labels.backToWorkspace}
        </a>

        <SettingsNavigationView
          selectedSection={selectedSection}
          labels={labels}
          onSelectSection={onSelectSection}
        />
      </AppSidebar>

      <SidebarResizeHandle
        label={labels.resizeSidebar}
        value={sidebarWidth}
        min={SIDEBAR_MIN_WIDTH}
        max={SIDEBAR_MAX_WIDTH}
        className="w-1 bg-background"
        onPointerDown={onResizePointerDown}
        onKeyDown={onResizeKeyDown}
      />

      <main
        aria-label={labels.main}
        className="relative min-h-0 flex-1 overflow-auto bg-background"
      >
        <div className="app-titlebar sticky top-0 z-10 h-12" aria-hidden="true" />
        <div className="mx-auto w-full max-w-[810px] px-8 pb-24 pt-12">
          <h1 className="sr-only">{labels.title}</h1>
          {mainContent}
        </div>
      </main>
    </div>
  )
}

export function SettingsNavigationView({
  selectedSection,
  labels,
  onSelectSection
}: {
  selectedSection: SettingsSectionId
  labels: SettingsLayoutViewLabels
  onSelectSection: (section: SettingsSectionId) => void
}): React.JSX.Element {
  return (
    <>
      <SettingsNavigationGroup
        label={labels.navigation}
        items={primarySettingsNavigation}
        selectedSection={selectedSection}
        labels={labels.sections}
        onSelectSection={onSelectSection}
      />

      <div className="my-4 border-t border-sidebar-border" />

      <SettingsNavigationGroup
        label={labels.experimentalNavigation}
        items={secondarySettingsNavigation}
        selectedSection={selectedSection}
        labels={labels.sections}
        onSelectSection={onSelectSection}
      />
    </>
  )
}

function SettingsNavigationGroup({
  label,
  items,
  selectedSection,
  labels,
  onSelectSection
}: {
  label: string
  items: ReadonlyArray<{
    id: SettingsSectionId
    icon: React.ComponentType<{ className?: string }>
  }>
  selectedSection: SettingsSectionId
  labels: Record<SettingsSectionId, string>
  onSelectSection: (section: SettingsSectionId) => void
}): React.JSX.Element {
  return (
    <SidebarMenu aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              render={
                <a
                  href={item.id === 'general' ? '#/settings' : `#/settings?section=${item.id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    onSelectSection(item.id)
                  }}
                />
              }
              isActive={selectedSection === item.id}
              className="text-muted-foreground"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{labels[item.id]}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
