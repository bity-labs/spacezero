import { GearSix, User } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactElement } from "react";

import { SIDEBAR_DEFAULT_WIDTH } from "../../components/sidebar/sidebar-layout";
import { useSidebarResize } from "../../hooks/use-sidebar-resize";
import { AppearanceSettingsPage } from "./appearance-settings-page";
import { ModelsSettingsPage } from "./models-settings-page";
import { SettingsLayoutView, type SettingsLayoutViewLabels } from "./settings-layout-view";
import type { SettingsSectionId } from "./settings-navigation";

export function SettingsLayout({
  selectedSection,
}: {
  selectedSection: SettingsSectionId;
}): ReactElement {
  const navigate = useNavigate();
  const [currentSection, setCurrentSection] = useState<SettingsSectionId>(selectedSection);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const leftSidebarResize = useSidebarResize({ width: sidebarWidth, setWidth: setSidebarWidth });

  const labels: SettingsLayoutViewLabels = {
    backToWorkspace: "Back to Workspace",
    navigation: "Settings navigation",
    main: "Settings",
    title: "Settings",
    resizeSidebar: "Resize settings sidebar",
    sections: {
      models: "Models",
      appearance: "Appearance",
    },
  };

  return (
    <SettingsLayoutView
      sidebarWidth={sidebarWidth}
      selectedSection={currentSection}
      accountMenu={<AccountMenu onCloseSettings={() => void navigate({ to: "/" })} />}
      mainContent={currentSection === "models" ? <ModelsSettingsPage /> : <AppearanceSettingsPage />}
      labels={labels}
      onBackToWorkspace={() => void navigate({ to: "/" })}
      onSelectSection={setCurrentSection}
      onResizePointerDown={leftSidebarResize.startResize}
      onResizeKeyDown={leftSidebarResize.resizeWithKeyboard}
    />
  );
}

function AccountMenu({ onCloseSettings }: { onCloseSettings: () => void }): ReactElement {
  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Account menu">
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <User className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm leading-5 text-muted-foreground">Not connected</span>
      </div>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Close settings"
        onClick={onCloseSettings}
      >
        <GearSix className="size-5" aria-hidden="true" />
      </button>
    </section>
  );
}
