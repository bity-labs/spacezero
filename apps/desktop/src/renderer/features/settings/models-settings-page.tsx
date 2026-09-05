import { useState, type ReactElement } from "react";

import { ModelsSettingsScreen } from "./models-settings-screen";
import {
  createModelsSettingsClients,
  useModelsSettings,
  type ModelsSettingsClients,
} from "./use-models-settings";

export type ModelsSettingsPageProps = {
  /** Host clients seam; defaults to real Client Runtime clients. */
  readonly clients?: ModelsSettingsClients;
};

export function ModelsSettingsPage({ clients }: ModelsSettingsPageProps): ReactElement {
  const [resolvedClients] = useState(() => clients ?? createModelsSettingsClients());
  const controller = useModelsSettings(resolvedClients);

  return <ModelsSettingsScreen {...controller} />;
}
