import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";

import "../../styles.css";

import { SIDEBAR_DEFAULT_WIDTH } from "../../components/sidebar/sidebar-layout";
import { useSidebarResize } from "../../hooks/use-sidebar-resize";
import { AppearanceSettingsPage } from "./appearance-settings-page";
import { SettingsLayoutView, type SettingsLayoutViewLabels } from "./settings-layout-view";
import type { SettingsSectionId } from "./settings-navigation";

const labels: SettingsLayoutViewLabels = {
  backToWorkspace: "Back to Workspace",
  navigation: "Settings navigation",
  main: "Settings",
  title: "Settings",
  resizeSidebar: "Resize settings sidebar",
  sections: {
    appearance: "Appearance",
  },
};

const meta: Meta<typeof SettingsLayoutStory> = {
  title: "Features/Settings/Layout",
  component: SettingsLayoutStory,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Appearance: Story = {};

function SettingsLayoutStory(): ReactElement {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>("appearance");
  const resize = useSidebarResize({ width: sidebarWidth, setWidth: setSidebarWidth });

  return (
    <SettingsLayoutView
      sidebarWidth={sidebarWidth}
      selectedSection={selectedSection}
      accountMenu={<StoryAccountMenu />}
      mainContent={<AppearanceSettingsPage />}
      labels={labels}
      onBackToWorkspace={() => undefined}
      onSelectSection={setSelectedSection}
      onResizePointerDown={resize.startResize}
      onResizeKeyDown={resize.resizeWithKeyboard}
    />
  );
}

function StoryAccountMenu(): ReactElement {
  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Account menu">
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
        SZ
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm leading-5 text-muted-foreground">Storybook</span>
      </div>
    </section>
  );
}
