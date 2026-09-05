import { useCallback, useEffect, useState } from "react";

import type {
  GetAgentRuntimeDefaultsResult,
  ListAgentRuntimeModelsResult,
  ProviderAuthOption,
} from "@spacezero/host-contracts";
import {
  createAgentRuntimeClient,
  createHarnessAuthClient,
  type AgentRuntimeClient,
  type HarnessAuthClient,
} from "@spacezero/client-runtime";

import {
  availableModelsFromDescriptors,
  authSettingsFromProviderOptions,
  clientErrorMessage,
  modelDefaultsFromAgentRuntimeDefaults,
} from "./models-settings-data";
import type {
  AuthProviderOption,
  AuthProviderStatus,
  AvailableModel,
  ModelAuthSettings,
  ModelDefaults,
  ModelsSettingsScreenProps,
  ThinkingLevel,
} from "./models-settings-screen";

/**
 * Host clients used by the Models settings container. Narrowed to the
 * operations this screen needs so tests and future OAuth wiring can inject
 * fakes at a single explicit seam.
 */
export type ModelsSettingsClients = {
  readonly harnessAuth: Pick<
    HarnessAuthClient,
    "listProviderAuthOptions" | "setProviderApiKey" | "removeProviderApiKey"
  >;
  readonly agentRuntime: Pick<
    AgentRuntimeClient,
    "listAgentRuntimeModels" | "getAgentRuntimeDefaults" | "updateAgentRuntimeDefaults"
  >;
};

export function createModelsSettingsClients(): ModelsSettingsClients {
  const getConnectionDescriptor = () => window.spacezero.getLocalHostConnection();
  return {
    harnessAuth: createHarnessAuthClient({ getConnectionDescriptor }),
    agentRuntime: createAgentRuntimeClient({ getConnectionDescriptor }),
  };
}

const LOAD_ERROR =
  "Model settings could not be loaded. Check your connection and try again.";
const SAVE_API_KEY_ERROR = "The API key could not be saved.";
const REMOVE_API_KEY_ERROR = "The API key could not be removed.";
const UPDATE_DEFAULTS_ERROR = "The default model settings could not be updated.";

export type ModelsSettingsController = ModelsSettingsScreenProps;

/**
 * Container behavior for Settings → Models. Loads provider auth options, the
 * sanitized model catalog, and Host-global runtime defaults, and turns screen
 * callbacks into authenticated Host commands followed by a full refresh.
 */
export function useModelsSettings(clients: ModelsSettingsClients): ModelsSettingsController {
  const [authSettings, setAuthSettings] = useState<ModelAuthSettings | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelDefaults, setModelDefaults] = useState<ModelDefaults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [subscriptionPickerOpen, setSubscriptionPickerOpen] = useState(false);
  const [apiKeyPickerOpen, setApiKeyPickerOpen] = useState(false);
  const [selectedApiKeyProvider, setSelectedApiKeyProvider] = useState<AuthProviderOption | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [defaultModelPickerOpen, setDefaultModelPickerOpen] = useState(false);

  const applyLoadedState = useCallback(
    ([providerOptions, modelsResult, defaultsResult]: [
      readonly ProviderAuthOption[],
      ListAgentRuntimeModelsResult,
      GetAgentRuntimeDefaultsResult,
    ]) => {
      setAuthSettings(authSettingsFromProviderOptions(providerOptions));
      setAvailableModels(availableModelsFromDescriptors(modelsResult.models));
      setModelDefaults(modelDefaultsFromAgentRuntimeDefaults(defaultsResult.defaults));
      setIsLoading(false);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      clients.harnessAuth.listProviderAuthOptions(),
      clients.agentRuntime.listAgentRuntimeModels(),
      clients.agentRuntime.getAgentRuntimeDefaults(),
    ]).then(
      (results) => {
        if (cancelled) return;
        setError(null);
        applyLoadedState(results);
      },
      () => {
        if (cancelled) return;
        setIsLoading(false);
        setError(LOAD_ERROR);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [applyLoadedState, clients]);

  /** Reloads auth, model catalog, and defaults after auth/defaults mutations. */
  const refresh = useCallback(
    async (): Promise<void> => {
      const results = await Promise.all([
        clients.harnessAuth.listProviderAuthOptions(),
        clients.agentRuntime.listAgentRuntimeModels(),
        clients.agentRuntime.getAgentRuntimeDefaults(),
      ]);
      applyLoadedState(results);
    },
    [applyLoadedState, clients],
  );

  const handleLoadError = useCallback(() => {
    setError(LOAD_ERROR);
  }, []);

  const handleApiKeyProviderSelect = useCallback((provider: AuthProviderOption) => {
    setApiKeyPickerOpen(false);
    setApiKey("");
    setSelectedApiKeyProvider(provider);
  }, []);

  const handleApiKeyDialogClose = useCallback(() => {
    setSelectedApiKeyProvider(null);
    setApiKey("");
  }, []);

  const handleSaveApiKey = useCallback(() => {
    const provider = selectedApiKeyProvider;
    if (!provider) return;
    const submittedKey = apiKey;
    // Raw keys are held only transiently: clear them as soon as submission
    // starts so they never linger in renderer state.
    setApiKey("");
    setPendingProviderId(provider.providerId);
    clients.harnessAuth.setProviderApiKey(provider.providerId, submittedKey).then(
      () => {
        setSelectedApiKeyProvider(null);
        setPendingProviderId(null);
        setError(null);
        refresh().catch(handleLoadError);
      },
      (cause: unknown) => {
        setPendingProviderId(null);
        setError(clientErrorMessage(cause, SAVE_API_KEY_ERROR));
      },
    );
  }, [apiKey, clients, handleLoadError, refresh, selectedApiKeyProvider]);

  const handleRemoveApiKey = useCallback(
    (provider: AuthProviderStatus) => {
      setPendingProviderId(provider.providerId);
      clients.harnessAuth.removeProviderApiKey(provider.providerId).then(
        () => {
          setPendingProviderId(null);
          setError(null);
          refresh().catch(handleLoadError);
        },
        (cause: unknown) => {
          setPendingProviderId(null);
          setError(clientErrorMessage(cause, REMOVE_API_KEY_ERROR));
        },
      );
    },
    [clients, handleLoadError, refresh],
  );

  const handleSelectDefaultModel = useCallback(
    (model: AvailableModel) => {
      clients.agentRuntime.updateAgentRuntimeDefaults({
        defaultModel: { providerId: model.providerId, modelId: model.modelId },
      }).then(
        (result) => {
          setModelDefaults(modelDefaultsFromAgentRuntimeDefaults(result.defaults));
          setError(null);
          setDefaultModelPickerOpen(false);
        },
        (cause: unknown) => {
          setError(clientErrorMessage(cause, UPDATE_DEFAULTS_ERROR));
        },
      );
    },
    [clients],
  );

  const handleSelectDefaultThinking = useCallback(
    (thinking: ThinkingLevel) => {
      clients.agentRuntime.updateAgentRuntimeDefaults({
        defaultThinkingLevel: thinking,
      }).then(
        (result) => {
          setModelDefaults(modelDefaultsFromAgentRuntimeDefaults(result.defaults));
          setError(null);
        },
        (cause: unknown) => {
          setError(clientErrorMessage(cause, UPDATE_DEFAULTS_ERROR));
        },
      );
    },
    [clients],
  );

  return {
    authSettings,
    availableModels,
    modelDefaults,
    isLoading,
    error,
    pendingProviderId,
    // Subscription OAuth connect/disconnect flows are wired separately; the
    // auth list itself already comes from the Host.
    subscriptionStatusMessage: null,
    subscriptionPickerOpen,
    apiKeyPickerOpen,
    selectedApiKeyProvider,
    apiKey,
    defaultModelPickerOpen,
    onSubscriptionPickerOpenChange: setSubscriptionPickerOpen,
    onApiKeyPickerOpenChange: setApiKeyPickerOpen,
    onApiKeyProviderSelect: handleApiKeyProviderSelect,
    onApiKeyChange: setApiKey,
    onApiKeyDialogClose: handleApiKeyDialogClose,
    onConnectSubscription: () => undefined,
    onDisconnectSubscription: () => undefined,
    onSaveApiKey: handleSaveApiKey,
    onRemoveApiKey: handleRemoveApiKey,
    onDefaultModelPickerOpenChange: setDefaultModelPickerOpen,
    onSelectDefaultModel: handleSelectDefaultModel,
    onSelectDefaultThinking: handleSelectDefaultThinking,
  };
}
