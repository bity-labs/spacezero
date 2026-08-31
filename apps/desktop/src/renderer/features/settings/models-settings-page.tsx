import type { ReactElement } from "react";

import { ModelsSettingsScreen } from "./models-settings-screen";

export function ModelsSettingsPage(): ReactElement {
  return (
    <ModelsSettingsScreen
      authSettings={null}
      availableModels={[]}
      modelDefaults={null}
      isLoading={false}
      error={null}
      pendingProviderId={null}
      subscriptionStatusMessage={null}
      subscriptionPickerOpen={false}
      apiKeyPickerOpen={false}
      selectedApiKeyProvider={null}
      apiKey=""
      defaultModelPickerOpen={false}
      onSubscriptionPickerOpenChange={() => undefined}
      onApiKeyPickerOpenChange={() => undefined}
      onApiKeyProviderSelect={() => undefined}
      onApiKeyChange={() => undefined}
      onApiKeyDialogClose={() => undefined}
      onConnectSubscription={() => undefined}
      onDisconnectSubscription={() => undefined}
      onSaveApiKey={() => undefined}
      onRemoveApiKey={() => undefined}
      onDefaultModelPickerOpenChange={() => undefined}
      onSelectDefaultModel={() => undefined}
      onSelectDefaultThinking={() => undefined}
    />
  );
}
