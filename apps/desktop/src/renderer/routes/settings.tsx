import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { SettingsLayout } from "../features/settings/settings-layout";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

function SettingsRoute(): ReactElement {
  return <SettingsLayout selectedSection="appearance" />;
}
