import { ArrowLeft, Cube, Gear, Palette } from "@phosphor-icons/react";
import { Button } from "@spacezero/ui/components/button";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@spacezero/ui/components/sidebar";
import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode } from "react";

import { AppSidebarView } from "../../components/sidebar/app-sidebar";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "../../components/sidebar/sidebar-layout";
import { SidebarResizeHandle } from "../../components/sidebar/sidebar-resize-handle";
import type { SettingsSectionId } from "./settings-navigation";

const settingsNavigation = [
  { id: "general", icon: Gear },
  { id: "models", icon: Cube },
  { id: "appearance", icon: Palette },
] as const;

type SettingsLayoutViewLabels = {
  backToWorkspace: string;
  navigation: string;
  main: string;
  title: string;
  resizeSidebar: string;
  sections: Record<SettingsSectionId, string>;
};

type SettingsLayoutViewProps = {
  sidebarWidth: number;
  selectedSection: SettingsSectionId;
  accountMenu: ReactNode;
  mainContent: ReactNode;
  labels: SettingsLayoutViewLabels;
  onBackToWorkspace: () => void;
  onSelectSection: (section: SettingsSectionId) => void;
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export function SettingsLayoutView({
  sidebarWidth,
  selectedSection,
  accountMenu,
  mainContent,
  labels,
  onBackToWorkspace,
  onSelectSection,
  onResizePointerDown,
  onResizeKeyDown,
}: SettingsLayoutViewProps): ReactElement {
  return (
    <div className="flex h-screen min-h-screen bg-background text-foreground">
      <AppSidebarView
        open
        onOpenChange={() => undefined}
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
        <Button
          variant="ghost"
          size="sm"
          className="mb-5 w-full justify-start gap-2 text-muted-foreground"
          onClick={onBackToWorkspace}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {labels.backToWorkspace}
        </Button>

        <SettingsNavigationView
          selectedSection={selectedSection}
          labels={labels}
          onSelectSection={onSelectSection}
        />
      </AppSidebarView>

      <SidebarResizeHandle
        label={labels.resizeSidebar}
        value={sidebarWidth}
        min={SIDEBAR_MIN_WIDTH}
        max={SIDEBAR_MAX_WIDTH}
        className="w-1 bg-background"
        onPointerDown={onResizePointerDown}
        onKeyDown={onResizeKeyDown}
      />

      <main aria-label={labels.main} className="relative min-h-0 flex-1 overflow-auto bg-background">
        <div className="app-titlebar sticky top-0 z-10 h-12" aria-hidden="true" />
        <div className="mx-auto w-full max-w-[810px] px-8 pb-24 pt-12">
          <h1 className="sr-only">{labels.title}</h1>
          {mainContent}
        </div>
      </main>
    </div>
  );
}

function SettingsNavigationView({
  selectedSection,
  labels,
  onSelectSection,
}: {
  selectedSection: SettingsSectionId;
  labels: SettingsLayoutViewLabels;
  onSelectSection: (section: SettingsSectionId) => void;
}): ReactElement {
  return (
    <SidebarMenu aria-label={labels.navigation}>
      {settingsNavigation.map((item) => {
        const Icon = item.icon;
        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              type="button"
              onClick={() => onSelectSection(item.id)}
              isActive={selectedSection === item.id}
              className="text-muted-foreground"
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{labels.sections[item.id]}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export type { SettingsLayoutViewLabels };
