import {
  type AgentRuntimeClient,
  type GlobalChatSessionClient,
} from "@spacezero/client-runtime";
import type { AgentModelDescriptor } from "@spacezero/host-contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";

import {
  SessionRuntimeModelSelector,
  type SessionRuntimeModelOption,
  type SessionRuntimeThinkingLevel,
} from "./session-runtime-model-selector.js";

export interface GlobalChatSessionRuntimeSelectorClients {
  readonly chat: Pick<GlobalChatSessionClient, "getRuntime" | "updateRuntime">;
  readonly agentRuntime: Pick<AgentRuntimeClient, "listAgentRuntimeModels">;
}

export const sessionRuntimeModelOptionId = (
  descriptor: Pick<AgentModelDescriptor, "providerId" | "modelId">,
): string => `${descriptor.providerId}:${descriptor.modelId}`;

/** Sanitized, selector-ready model options from the Host model catalog. */
export const runtimeModelOptionsFromDescriptors = (
  descriptors: readonly AgentModelDescriptor[],
): readonly {
  readonly option: SessionRuntimeModelOption;
  readonly descriptor: AgentModelDescriptor;
}[] =>
  descriptors
    .filter((descriptor) => descriptor.available && descriptor.authenticated)
    .map((descriptor) => ({
      descriptor,
      option: {
        id: sessionRuntimeModelOptionId(descriptor),
        name: descriptor.displayName,
        description: descriptor.providerDisplayName,
        supportedThinkingLevels: descriptor.supportedThinkingLevels,
      },
    }));

/**
 * Picks the thinking level to keep when the selected model changes: keep the
 * current level when the new model supports it, fall back to "off", then to
 * the first level the model supports.
 */
export const nextThinkingLevelForModel = (
  descriptor: AgentModelDescriptor,
  currentLevel: SessionRuntimeThinkingLevel | undefined,
): SessionRuntimeThinkingLevel => {
  const supported = descriptor.supportedThinkingLevels;
  if (currentLevel !== undefined && supported.includes(currentLevel)) {
    return currentLevel;
  }
  if (supported.includes("off")) return "off";
  return supported[0] ?? "off";
};

interface RuntimeSelectorState {
  readonly optionId: string | undefined;
  readonly thinkingLevel: SessionRuntimeThinkingLevel | undefined;
  readonly revision: number | undefined;
  readonly models: readonly {
    readonly option: SessionRuntimeModelOption;
    readonly descriptor: AgentModelDescriptor;
  }[];
}

/**
 * Container wiring the Global Chat Session surface to Host-owned session
 * runtime configuration through Client Runtime: reads the sanitized runtime
 * configuration and model catalog, and applies provider/model/thinking
 * changes with expected revision semantics. The renderer never sees Pi
 * credentials, provider auth material, or raw Pi model records; failures
 * surface as plain messages and reload the Host-owned state.
 */
export function GlobalChatSessionRuntimeSelector({
  sessionId,
  clients,
  disabled = false,
  placement = "header",
}: {
  readonly sessionId: string;
  readonly clients: GlobalChatSessionRuntimeSelectorClients;
  readonly disabled?: boolean;
  readonly placement?: "header" | "composer";
}): ReactElement | null {
  const { t } = useTranslation();
  const [state, setState] = useState<RuntimeSelectorState>({
    optionId: undefined,
    thinkingLevel: undefined,
    revision: undefined,
    models: [],
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Loads the Host-owned runtime configuration and sanitized model catalog
  // once per session; both stay plain Client Runtime results.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      clients.chat.getRuntime(sessionId),
      clients.agentRuntime.listAgentRuntimeModels(),
    ]).then(
      ([runtimeResult, modelsResult]) => {
        if (cancelled) return;
        const models = runtimeModelOptionsFromDescriptors(modelsResult.models);
        const runtime = runtimeResult.runtime;
        setState({
          optionId: sessionRuntimeModelOptionId(runtime),
          thinkingLevel: runtime.defaultThinkingLevel,
          revision: runtime.revision,
          models,
        });
      },
      () => {
        if (cancelled) return;
        setError(t("conversations.runtimeLoadError"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [clients.agentRuntime, clients.chat, sessionId, t]);

  const selectedEntry = useMemo(
    () => state.models.find((entry) => entry.option.id === state.optionId),
    [state.models, state.optionId],
  );

  const applyRuntimeUpdate = useCallback(
    async (
      providerId: string,
      modelId: string,
      level: SessionRuntimeThinkingLevel,
    ) => {
      const revision = state.revision;
      if (revision === undefined) return;
      setPending(true);
      setError(undefined);
      try {
        const result = await clients.chat.updateRuntime(sessionId, {
          providerId,
          modelId,
          defaultThinkingLevel: level,
          expectedRevision: revision,
        });
        setState((previous) => ({
          ...previous,
          optionId: sessionRuntimeModelOptionId(result.runtime),
          thinkingLevel: result.runtime.defaultThinkingLevel,
          revision: result.runtime.revision,
        }));
      } catch (cause: unknown) {
        const code =
          typeof cause === "object" &&
          cause !== null &&
          "code" in cause &&
          typeof (cause as { code: unknown }).code === "string"
            ? (cause as { code: string }).code
            : undefined;
        setError(
          code === "global_chat_session_runtime_revision_conflict"
            ? t("conversations.runtimeRevisionConflict")
            : t("conversations.runtimeUpdateError"),
        );
        // Revision conflicts mean the Host-owned state moved: reload it so
        // the next attempt uses the current revision.
        try {
          const refreshed = await clients.chat.getRuntime(sessionId);
          setState((previous) => ({
            ...previous,
            optionId: sessionRuntimeModelOptionId(refreshed.runtime),
            thinkingLevel: refreshed.runtime.defaultThinkingLevel,
            revision: refreshed.runtime.revision,
          }));
        } catch {
          // Keep the previous view state; the error message already explains it.
        }
      } finally {
        setPending(false);
      }
    },
    [clients.chat, sessionId, state.revision, t],
  );

  const handleModelChange = useCallback(
    (optionId: string) => {
      const entry = state.models.find(
        (candidate) => candidate.option.id === optionId,
      );
      if (!entry || pending) return;
      void applyRuntimeUpdate(
        entry.descriptor.providerId,
        entry.descriptor.modelId,
        nextThinkingLevelForModel(entry.descriptor, state.thinkingLevel),
      );
    },
    [applyRuntimeUpdate, pending, state.models, state.thinkingLevel],
  );

  const handleThinkingLevelChange = useCallback(
    (level: SessionRuntimeThinkingLevel) => {
      const entry = selectedEntry;
      if (!entry || pending) return;
      void applyRuntimeUpdate(
        entry.descriptor.providerId,
        entry.descriptor.modelId,
        level,
      );
    },
    [applyRuntimeUpdate, pending, selectedEntry],
  );

  if (
    state.optionId === undefined ||
    state.thinkingLevel === undefined ||
    state.models.length === 0
  ) {
    return error ? (
      <p
        role="alert"
        data-testid="global-chat-session-runtime-error"
        className="text-sm text-destructive"
      >
        {error}
      </p>
    ) : null;
  }

  return (
    <div
      className={
        placement === "composer"
          ? "flex items-center gap-1"
          : "flex flex-col items-end gap-1"
      }
      data-testid="global-chat-session-runtime-selector"
    >
      <SessionRuntimeModelSelector
        models={state.models.map((entry) => entry.option)}
        selectedModelId={state.optionId}
        selectedThinkingLevel={state.thinkingLevel}
        onModelChange={handleModelChange}
        onThinkingLevelChange={handleThinkingLevelChange}
        disabled={disabled || pending}
        label={t("conversations.runtimeModelLabel")}
        thinkingLabel={t("conversations.runtimeThinkingLabel")}
        placement={placement}
      />
      {error ? (
        <p
          role="alert"
          data-testid="global-chat-session-runtime-error"
          className="max-w-64 text-right text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
