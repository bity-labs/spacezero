import { useCallback, useEffect, useRef, useState } from "react";

import type {
  FlowEventEnvelope,
  GetAgentRuntimeDefaultsResult,
  ListAgentRuntimeModelsResult,
  ProviderAuthOption,
} from "@spacezero/host-contracts";
import {
  createAgentRuntimeClient,
  createFlowClient,
  createHarnessAuthClient,
  type AgentRuntimeClient,
  type FlowClient,
  type FlowEventSubscription,
  type HarnessAuthClient,
} from "@spacezero/client-runtime";

import {
  availableModelsFromDescriptors,
  authSettingsFromProviderOptions,
  clientErrorMessage,
  flowStatusUpdateFromEvent,
  modelDefaultsFromAgentRuntimeDefaults,
} from "./models-settings-data";
import type {
  AuthProviderOption,
  AuthProviderStatus,
  AvailableModel,
  FlowPrompt,
  ModelAuthSettings,
  ModelDefaults,
  ModelsSettingsScreenProps,
  SubscriptionStatusTone,
  ThinkingLevel,
} from "./models-settings-screen";

/**
 * Host clients used by the Models settings container. Narrowed to the
 * operations this screen needs so tests and OAuth wiring can inject fakes at
 * a single explicit seam.
 */
export type ModelsSettingsClients = {
  readonly harnessAuth: Pick<
    HarnessAuthClient,
    "listProviderAuthOptions" | "startProviderOAuthLogin" | "setProviderApiKey" | "removeProviderApiKey"
  >;
  readonly flows: Pick<
    FlowClient,
    "subscribeFlowEvents" | "respondToPrompt" | "cancelFlow"
  >;
  readonly agentRuntime: Pick<
    AgentRuntimeClient,
    "listAgentRuntimeModels" | "getAgentRuntimeDefaults" | "updateAgentRuntimeDefaults"
  >;
  /** Desktop-safe external URL opening; never used for callbacks or secrets. */
  readonly openExternalUrl: (url: string) => Promise<unknown>;
};

export function createModelsSettingsClients(): ModelsSettingsClients {
  const getConnectionDescriptor = () => window.spacezero.getLocalHostConnection();
  return {
    harnessAuth: createHarnessAuthClient({ getConnectionDescriptor }),
    flows: createFlowClient({ getConnectionDescriptor }),
    agentRuntime: createAgentRuntimeClient({ getConnectionDescriptor }),
    openExternalUrl: (url) => window.spacezero.openExternalUrl(url),
  };
}

const LOAD_ERROR =
  "Model settings could not be loaded. Check your connection and try again.";
const SAVE_API_KEY_ERROR = "The API key could not be saved.";
const REMOVE_API_KEY_ERROR = "The API key could not be removed.";
const DISCONNECT_SUBSCRIPTION_ERROR =
  "The subscription could not be disconnected.";
const UPDATE_DEFAULTS_ERROR = "The default model settings could not be updated.";
const CONNECT_SUBSCRIPTION_ERROR =
  "The subscription could not be connected. Check your connection and try again.";
const FLOW_INTERRUPTED_ERROR =
  "The sign-in connection was interrupted. Check your connection and try again.";
const FLOW_PROMPT_ERROR =
  "The sign-in response could not be submitted. Check your connection and try again.";
const FLOW_CANCEL_ERROR = "The sign-in flow could not be cancelled.";

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
  const [subscriptionStatusMessage, setSubscriptionStatusMessage] = useState<string | null>(null);
  const [subscriptionStatusTone, setSubscriptionStatusTone] = useState<SubscriptionStatusTone>("info");
  const [flowPrompt, setFlowPrompt] = useState<FlowPrompt | null>(null);
  const flowSubscriptionRef = useRef<FlowEventSubscription | null>(null);
  const activeFlowRef = useRef<{ flowId: string; providerLabel: string } | null>(null);
  /** Bumped on every connect; stale flow starts are abandoned. */
  const flowStartSeqRef = useRef(0);
  /** Set on unmount; a flow that resolves afterwards is cancelled Host-side. */
  const disposedRef = useRef(false);
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

  const endFlowSubscription = useCallback(() => {
    flowSubscriptionRef.current?.cancel();
    flowSubscriptionRef.current = null;
  }, []);

  /** Cleans up a finished or replaced flow without changing status text. */
  const finishFlow = useCallback(() => {
    endFlowSubscription();
    activeFlowRef.current = null;
    setFlowPrompt(null);
    setPendingProviderId(null);
  }, [endFlowSubscription]);

  /**
   * Abandons the active or superseded flow: drops its event subscription and
   * cancels it Host-side so an orphaned OAuth flow cannot keep running.
   */
  const abandonFlow = useCallback(
    (flow: { flowId: string } | null) => {
      endFlowSubscription();
      activeFlowRef.current = null;
      setFlowPrompt(null);
      if (flow) void clients.flows.cancelFlow(flow.flowId).catch(() => undefined);
    },
    [clients, endFlowSubscription],
  );

  const handleFlowEvent = useCallback(
    (envelope: FlowEventEnvelope) => {
      const flow = activeFlowRef.current;
      if (!flow || envelope.flowId !== flow.flowId) return;
      const update = flowStatusUpdateFromEvent(envelope.event, flow.providerLabel);
      if (update.message) {
        setSubscriptionStatusMessage(update.message);
        setSubscriptionStatusTone(update.tone);
      }
      if (update.prompt) setFlowPrompt(update.prompt);
      if (update.openUrl) {
        // External auth URLs always go through the Desktop-safe opener; the
        // renderer never sees callback handling or provider credentials.
        clients.openExternalUrl(update.openUrl).catch(() => undefined);
      }
      if (update.terminal) {
        const shouldRefresh = envelope.event.type === "flow.completed";
        finishFlow();
        if (shouldRefresh) refresh().catch(handleLoadError);
      }
    },
    [clients, finishFlow, handleLoadError, refresh],
  );

  const handleConnectSubscription = useCallback(
    (provider: AuthProviderOption) => {
      setSubscriptionPickerOpen(false);
      // Re-entry guard: abandon any active flow and invalidate any in-flight
      // start before beginning a new one, so stale flows can never overwrite
      // the active refs or race the newer flow.
      const seq = ++flowStartSeqRef.current;
      abandonFlow(activeFlowRef.current);
      setPendingProviderId(provider.providerId);
      setSubscriptionStatusMessage(null);
      setSubscriptionStatusTone("info");
      setFlowPrompt(null);
      clients.harnessAuth.startProviderOAuthLogin(provider.providerId).then(
        ({ flowId }) => {
          if (disposedRef.current || seq !== flowStartSeqRef.current) {
            // The flow started after unmount or was superseded by a newer
            // connect: cancel it Host-side instead of subscribing.
            void clients.flows.cancelFlow(flowId).catch(() => undefined);
            return;
          }
          activeFlowRef.current = { flowId, providerLabel: provider.label };
          flowSubscriptionRef.current = clients.flows.subscribeFlowEvents({
            flowId,
            onEvent: handleFlowEvent,
            onError: () => {
              setSubscriptionStatusMessage(FLOW_INTERRUPTED_ERROR);
              setSubscriptionStatusTone("error");
            },
          });
        },
        (cause: unknown) => {
          if (disposedRef.current || seq !== flowStartSeqRef.current) return;
          setPendingProviderId(null);
          setSubscriptionStatusMessage(clientErrorMessage(cause, CONNECT_SUBSCRIPTION_ERROR));
          setSubscriptionStatusTone("error");
        },
      );
    },
    [abandonFlow, clients, handleFlowEvent],
  );

  const handleFlowPromptSubmit = useCallback(
    (response: string) => {
      const flow = activeFlowRef.current;
      const prompt = flowPrompt;
      if (!flow || !prompt) return;
      setFlowPrompt(null);
      clients.flows.respondToPrompt(flow.flowId, prompt.promptId, response).catch(() => {
        setSubscriptionStatusMessage(FLOW_PROMPT_ERROR);
        setSubscriptionStatusTone("error");
      });
    },
    [clients, flowPrompt],
  );

  const handleFlowPromptCancel = useCallback(() => {
    const flow = activeFlowRef.current;
    if (!flow) return;
    setFlowPrompt(null);
    clients.flows.cancelFlow(flow.flowId).catch(() => {
      setSubscriptionStatusMessage(FLOW_CANCEL_ERROR);
      setSubscriptionStatusTone("error");
    });
  }, [clients]);

  // Stop flow event subscriptions when the settings container unmounts. A
  // start that resolves afterwards is cancelled Host-side via disposedRef.
  // StrictMode (dev) runs this effect as mount → cleanup → remount on the
  // same instance, so re-arm the flag on remount or every connect would
  // silently cancel its Host flow instead of subscribing.
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      flowSubscriptionRef.current?.cancel();
      flowSubscriptionRef.current = null;
      activeFlowRef.current = null;
    };
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

  const handleDisconnectSubscription = useCallback(
    (provider: AuthProviderStatus) => {
      setPendingProviderId(provider.providerId);
      // Removing the stored credential also covers OAuth-configured
      // subscriptions; the Host reconciles defaults after removal.
      clients.harnessAuth.removeProviderApiKey(provider.providerId).then(
        () => {
          setPendingProviderId(null);
          setError(null);
          refresh().catch(handleLoadError);
        },
        (cause: unknown) => {
          setPendingProviderId(null);
          setError(clientErrorMessage(cause, DISCONNECT_SUBSCRIPTION_ERROR));
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
    subscriptionStatusMessage,
    subscriptionStatusTone,
    flowPrompt,
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
    onConnectSubscription: handleConnectSubscription,
    onDisconnectSubscription: handleDisconnectSubscription,
    onFlowPromptSubmit: handleFlowPromptSubmit,
    onFlowPromptCancel: handleFlowPromptCancel,
    onSaveApiKey: handleSaveApiKey,
    onRemoveApiKey: handleRemoveApiKey,
    onDefaultModelPickerOpenChange: setDefaultModelPickerOpen,
    onSelectDefaultModel: handleSelectDefaultModel,
    onSelectDefaultThinking: handleSelectDefaultThinking,
  };
}
