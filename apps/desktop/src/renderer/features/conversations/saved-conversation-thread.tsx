import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadAssistantMessagePart,
  type ThreadMessage,
} from "@assistant-ui/react";
import { Thread, type ThreadViewState } from "@spacezero/ui/components/thread";
import { ErrorState } from "@spacezero/ui/components/assistant-ui/elements/error-state";
import { StoppedRun } from "@spacezero/ui/components/assistant-ui/elements/stopped-run";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  createGlobalChatSessionClient,
  createGlobalChatSessionSavedConversationStore,
  createProjectSessionClient,
  createProjectSessionSavedConversationStore,
  type SavedConversationMessage,
  type SavedConversationProjection,
  type SavedConversationStore,
} from "@spacezero/client-runtime";

const completedAssistantStatus = {
  type: "complete",
  reason: "stop",
} as const;
const runningAssistantStatus = { type: "running" } as const;

/**
 * Shared chat status policy: while a turn is running, the status banner
 * shows the latest sanitized tool activity summary when tool work is known,
 * and falls back to the plain responding label otherwise.
 */
const runningTurnActivityLabel = (
  projection: SavedConversationProjection,
): string | undefined => {
  if (projection.runtime.status !== "running") return undefined;
  const turnId =
    projection.runtime.activeTurnId ?? projection.runtime.latestTurnId;
  const toolPart = [...projection.messages]
    .filter(
      (message) =>
        message.role === "assistant" &&
        (turnId === undefined || message.turnId === turnId),
    )
    .reverse()
    .flatMap((message) => message.parts)
    .find((part) => part.type === "tool-call");
  if (toolPart?.type !== "tool-call") return undefined;
  return toolPart.progress ?? `Running ${toolPart.toolName}`;
};

const assistantActivityLabel = (
  projection: SavedConversationProjection,
): string | undefined => {
  if (projection.runtime.status !== "running") return undefined;
  return runningTurnActivityLabel(projection) ?? "Thinking";
};

const textFromAppendMessage = (message: AppendMessage): string =>
  message.content
    .map((part) => {
      if (part.type === "text") return part.text;
      return "";
    })
    .join("")
    .trim();

export const toAssistantThreadMessage = (
  message: SavedConversationMessage,
  projection: SavedConversationProjection,
): ThreadMessage => {
  const createdAt = new Date(message.createdAt);
  const custom = {
    spacezero: {
      kind: projection.session.kind,
      sessionId: projection.session.id,
      sequence: message.sequence,
      ...(message.commandId === undefined
        ? {}
        : { commandId: message.commandId }),
      ...(message.turnId === undefined ? {} : { turnId: message.turnId }),
      ...(message.status === undefined ? {} : { status: message.status }),
    },
  };
  const content = message.parts.map((part) => {
    if (part.type === "tool-call")
      return {
        type: "tool-call" as const,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        status: part.status,
        args: part.arguments ?? {},
        argsText: JSON.stringify(part.arguments ?? {}, null, 2),
        ...(part.progress === undefined ? {} : { progress: part.progress }),
        ...(part.result === undefined ? {} : { result: part.result }),
        ...(part.safety === undefined ? {} : { safety: part.safety }),
        ...(part.approvalStatus === undefined
          ? {}
          : { approvalStatus: part.approvalStatus }),
        ...(part.approvalReason === undefined
          ? {}
          : { approvalReason: part.approvalReason }),
      };
    return {
      type: part.type,
      text: part.text,
    };
  });
  if (message.role === "user")
    return {
      id: message.id,
      role: "user",
      createdAt,
      content: content.flatMap((part) =>
        part.type === "text"
          ? [{ type: "text" as const, text: part.text }]
          : [],
      ),
      attachments: [],
      metadata: {
        isOptimistic: message.status === "pending",
        custom,
      },
    };
  const isRunningTail =
    projection.runtime.status === "running" &&
    (projection.runtime.activeTurnId === message.turnId ||
      projection.messages.at(-1)?.id === message.id);
  return {
    id: message.id,
    role: "assistant",
    createdAt,
    content: content.map((part) =>
      part.type === "tool-call"
        ? part
        : {
            ...part,
            status: isRunningTail
              ? runningAssistantStatus
              : completedAssistantStatus,
          },
    ) as readonly ThreadAssistantMessagePart[],
    status: isRunningTail ? runningAssistantStatus : completedAssistantStatus,
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom,
    },
  };
};

const useSavedConversationSnapshot = (
  store: SavedConversationStore,
): SavedConversationProjection =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

const estimatedComposerContextUsage = (
  projection: SavedConversationProjection,
): { system: number; tools: number; messages: number; total: number } => {
  const textChars = projection.messages.reduce(
    (total, message) => total + message.text.length,
    0,
  );
  const toolCalls = projection.messages.reduce(
    (total, message) =>
      total + message.parts.filter((part) => part.type === "tool-call").length,
    0,
  );
  return {
    system: 1,
    tools: Math.ceil(toolCalls / 4),
    messages: Math.ceil(textChars / 4000),
    total: 128,
  };
};

const threadState = (
  status: SavedConversationProjection["status"],
): ThreadViewState => {
  switch (status) {
    case "idle":
    case "loading":
      return "loading";
    case "empty":
      return "empty";
    case "unavailable":
      return "unavailable";
    case "error":
      return "error";
    case "ready":
      return "ready";
  }
};

const ConversationStatusBanner = ({
  projection,
}: {
  readonly projection: SavedConversationProjection;
}): ReactElement | null => {
  if (projection.status === "error") return null;
  if (projection.connection.status === "disconnected")
    return (
      <div
        role="alert"
        className="border-b border-amber-300/40 bg-amber-100/70 px-4 py-3 text-sm text-amber-950"
      >
        Connection lost. Reconnecting to the Host; running work may still be
        active.
      </div>
    );
  if (projection.runtime.status === "recovery_required")
    return (
      <div
        role="alert"
        className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        Conversation storage failed or requires recovery. Space Zero requested
        cancellation; saved history remains available where possible, and queued
        work will not continue until recovery.
      </div>
    );
  return null;
};

const failedTurnRetryPrompt = (
  projection: SavedConversationProjection,
): string | undefined => {
  if (
    projection.runtime.status !== "failed" ||
    projection.runtime.latestTurnId === undefined
  )
    return undefined;
  const prompt = [...projection.messages]
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        message.turnId === projection.runtime.latestTurnId,
    );
  const text = prompt?.text.trim();
  return text === undefined || text.length === 0 ? undefined : text;
};

interface InterruptedRunNotice {
  readonly words: readonly string[];
  /**
   * The partial assistant message is presented through StoppedRun instead of a
   * transcript row, so it must be removed from the messages handed to the
   * runtime to avoid duplicated text.
   */
  readonly replacedMessageId?: string;
}

const interruptedRun = (
  projection: SavedConversationProjection,
): InterruptedRunNotice | undefined => {
  if (projection.runtime.status !== "interrupted") return undefined;
  const latestTurnId = projection.runtime.latestTurnId;
  const partial = [...projection.messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        (latestTurnId === undefined || message.turnId === latestTurnId),
    );
  if (!partial || partial.text.length === 0) return { words: [] };
  const isTextOnly =
    partial.parts.length > 0 &&
    partial.parts.every((part) => part.type === "text");
  return isTextOnly
    ? { words: [partial.text], replacedMessageId: partial.id }
    : { words: [] };
};

export function SavedConversationThread({
  store,
  composerStartContent,
}: {
  readonly store: SavedConversationStore;
  readonly composerStartContent?: ReactNode;
}): ReactElement {
  const projection = useSavedConversationSnapshot(store);
  const storeLifecycleGeneration = useRef(0);
  const [retrying, setRetrying] = useState(false);
  const sessionKey = `${projection.session.kind}:${projection.session.id}`;
  const activeStopTarget = useMemo(
    () =>
      projection.runtime.status === "running" &&
      projection.runtime.activeTurnId !== undefined
        ? {
            sessionId: projection.session.id,
            turnId: projection.runtime.activeTurnId,
          }
        : undefined,
    [
      projection.runtime.activeTurnId,
      projection.runtime.status,
      projection.session.id,
    ],
  );
  const retryPrompt = useMemo(
    () => failedTurnRetryPrompt(projection),
    [projection],
  );
  const interrupted = useMemo(() => interruptedRun(projection), [projection]);
  const composerContextUsage = useMemo(
    () => estimatedComposerContextUsage(projection),
    [projection],
  );
  const activityLabel = useMemo(
    () => assistantActivityLabel(projection),
    [projection],
  );

  useEffect(() => {
    const lifecycleGeneration = storeLifecycleGeneration.current + 1;
    storeLifecycleGeneration.current = lifecycleGeneration;
    void store.load().catch(() => undefined);
    return () => {
      queueMicrotask(() => {
        if (storeLifecycleGeneration.current === lifecycleGeneration)
          store.dispose();
      });
    };
  }, [store]);

  const retryFailedTurn = () => {
    if (retryPrompt === undefined || retrying) return;
    // Host-backed retry only: resubmit the failed turn's original prompt as a
    // real Host prompt command; never fabricate a local turn. The retrying
    // state stays visible only while that Host request is in flight.
    setRetrying(true);
    void store
      .send(retryPrompt)
      .catch(() => undefined)
      .finally(() => setRetrying(false));
  };

  const adapter = useMemo(
    () => ({
      messages:
        interrupted?.replacedMessageId === undefined
          ? projection.messages
          : projection.messages.filter(
              (message) => message.id !== interrupted.replacedMessageId,
            ),
      isDisabled: projection.actions.send === "unavailable",
      isSendDisabled:
        projection.actions.send === "unavailable" ||
        projection.actions.send === "submitting" ||
        projection.actions.send === "unresolved" ||
        projection.status === "loading" ||
        projection.status === "idle" ||
        projection.status === "error",
      isLoading:
        projection.status === "loading" || projection.status === "idle",
      isRunning:
        projection.runtime.status === "running" &&
        projection.actions.send !== "available",
      queue:
        projection.runtime.status === "running"
          ? {
              items: projection.queue.followUps
                .filter(
                  (item) =>
                    item.state === "queued" || item.status === "pending",
                )
                .map((item) => ({
                  id: item.id,
                  prompt: item.prompt,
                  parts: [{ type: "text" as const, text: item.prompt }],
                })),
              steerItems: [],
              enqueue: (message: AppendMessage) => {
                const text = textFromAppendMessage(message);
                if (text.length === 0) return;
                void store.send(text).catch(() => undefined);
              },
              steer: () => undefined,
              move: () => undefined,
              edit: () => undefined,
              remove: (queueItemId: string) => {
                void store.cancelFollowUp(queueItemId).catch(() => undefined);
              },
            }
          : undefined,
      onNew: async (message: AppendMessage) => {
        const text = textFromAppendMessage(message);
        if (text.length === 0) return;
        await store.send(text);
      },
      onCancel: async () => {
        if (
          projection.actions.stop !== "available" ||
          activeStopTarget === undefined
        )
          return;
        await store.stop(activeStopTarget);
      },
      convertMessage: (message: SavedConversationMessage) =>
        toAssistantThreadMessage(message, projection),
      unstable_enableToolInvocations: false,
    }),
    [activeStopTarget, interrupted, projection, store],
  );
  const runtime = useExternalStoreRuntime(adapter);

  return (
    <AssistantRuntimeProvider key={sessionKey} runtime={runtime}>
      <div className="flex min-h-0 flex-1 flex-col">
        <ConversationStatusBanner projection={projection} />
        {projection.runtime.status === "failed" ? (
          <div className="border-b border-border px-4 py-3">
            <ErrorState
              title="Assistant turn failed"
              detail={
                retryPrompt === undefined
                  ? "The latest agent turn failed and no original prompt is available to retry."
                  : "Retry resends the failed turn's original prompt to the Host."
              }
              retrying={retrying}
              {...(retryPrompt === undefined
                ? {}
                : { onRetry: retryFailedTurn })}
            />
          </div>
        ) : null}
        {projection.runtime.status === "interrupted" &&
        interrupted !== undefined ? (
          <div className="border-b border-border px-4 py-3">
            <StoppedRun words={interrupted.words} reason="Interrupted" />
          </div>
        ) : null}
        <Thread
          state={threadState(projection.status)}
          {...(projection.error?.message === undefined
            ? {}
            : { errorMessage: projection.error.message })}
          queueItems={projection.queue.followUps}
          hasMoreOlder={projection.history.hasMoreOlder}
          isLoadingOlder={projection.history.loadingOlder}
          onLoadOlder={() => {
            void store.loadOlder().catch(() => undefined);
          }}
          onCancelQueueItem={(id) => {
            void store.cancelFollowUp(id).catch(() => undefined);
          }}
          isRunning={
            projection.runtime.status === "running" &&
            projection.actions.stop === "available"
          }
          composerStartContent={composerStartContent}
          composerContextUsage={composerContextUsage}
          {...(activityLabel === undefined
            ? {}
            : { assistantActivityLabel: activityLabel })}
          {...(projection.actions.stop === "available" &&
          activeStopTarget !== undefined
            ? {
                onStop: () => {
                  void store.stop(activeStopTarget).catch(() => undefined);
                },
              }
            : {})}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

export function ProjectSessionSavedConversationThread({
  sessionId,
}: {
  readonly sessionId: string;
}): ReactElement {
  const store = useMemo(() => {
    const client = createProjectSessionClient({
      getConnectionDescriptor: window.spacezero.getLocalHostConnection,
    });
    return createProjectSessionSavedConversationStore({ client, sessionId });
  }, [sessionId]);
  return <SavedConversationThread store={store} />;
}

export function GlobalChatSessionSavedConversationThread({
  sessionId,
}: {
  readonly sessionId: string;
}): ReactElement {
  const store = useMemo(() => {
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: window.spacezero.getLocalHostConnection,
    });
    return createGlobalChatSessionSavedConversationStore({ client, sessionId });
  }, [sessionId]);
  return <SavedConversationThread store={store} />;
}
