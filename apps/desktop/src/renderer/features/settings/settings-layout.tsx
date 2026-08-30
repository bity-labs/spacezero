import { GearSix, User } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { SIDEBAR_DEFAULT_WIDTH } from "../../components/sidebar/sidebar-layout";
import { useSidebarResize } from "../../hooks/use-sidebar-resize";
import { AppearanceSettingsPage } from "./appearance-settings-page";
import { GeneralSettingsPage } from "./general-settings-page";
import { ModelsSettingsPage } from "./models-settings-page";
import { SettingsLayoutView, type SettingsLayoutViewLabels } from "./settings-layout-view";
import type { SettingsSectionId } from "./settings-navigation";

export function SettingsLayout({
  selectedSection,
}: {
  selectedSection: SettingsSectionId;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentSection, setCurrentSection] = useState<SettingsSectionId>(selectedSection);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const leftSidebarResize = useSidebarResize({ width: sidebarWidth, setWidth: setSidebarWidth });

  const labels: SettingsLayoutViewLabels = {
    backToWorkspace: t("settings.backToWorkspace"),
    navigation: t("settings.navigation"),
    main: t("settings.main"),
    title: t("settings.title"),
    resizeSidebar: t("settings.resizeSidebar"),
    sections: {
      general: t("settings.sections.general"),
      models: t("settings.sections.models"),
      appearance: t("settings.sections.appearance"),
    },
  };

  return (
    <SettingsLayoutView
      sidebarWidth={sidebarWidth}
      selectedSection={currentSection}
      accountMenu={<AccountMenu onCloseSettings={() => void navigate({ to: "/" })} />}
      mainContent={getSettingsPage(currentSection)}
      labels={labels}
      onBackToWorkspace={() => void navigate({ to: "/" })}
      onSelectSection={setCurrentSection}
      onResizePointerDown={leftSidebarResize.startResize}
      onResizeKeyDown={leftSidebarResize.resizeWithKeyboard}
    />
  );
}

function getSettingsPage(section: SettingsSectionId): ReactElement {
  if (section === "models") return <ModelsSettingsPage />;
  if (section === "appearance") return <AppearanceSettingsPage />;
  return <GeneralSettingsPage />;
}

function AccountMenu({ onCloseSettings }: { onCloseSettings: () => void }): ReactElement {
  const { t } = useTranslation();

  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label={t("workspace.accountMenu")}>
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <User className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm leading-5 text-muted-foreground">{t("workspace.notConnected")}</span>
      </div>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={t("settings.close")}
        onClick={onCloseSettings}
      >
        <GearSix className="size-5" aria-hidden="true" />
      </button>
    </section>
  );
}
