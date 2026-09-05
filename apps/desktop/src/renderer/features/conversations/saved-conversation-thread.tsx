import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessage,
} from "@assistant-ui/react";
import { Thread, type ThreadViewState } from "@spacezero/ui/components/thread";
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
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

const readOnlyActionError = new Error(
  "Saved conversations are read-only until Host-backed conversation actions are implemented.",
);

const completedAssistantStatus = {
  type: "complete",
  reason: "stop",
} as const;
const runningAssistantStatus = { type: "running" } as const;

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
    },
  };
  if (message.role === "user")
    return {
      id: message.id,
      role: "user",
      createdAt,
      content: [{ type: "text", text: message.text }],
      attachments: [],
      metadata: { custom },
    };
  const isRunningTail =
    projection.runtime.status === "running" &&
    projection.messages.at(-1)?.id === message.id;
  return {
    id: message.id,
    role: "assistant",
    createdAt,
    content: [
      {
        type: "text",
        text: message.text,
        status: isRunningTail
          ? runningAssistantStatus
          : completedAssistantStatus,
      },
    ],
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

export function SavedConversationThread({
  store,
}: {
  readonly store: SavedConversationStore;
}): ReactElement {
  const projection = useSavedConversationSnapshot(store);
  const sessionKey = `${projection.session.kind}:${projection.session.id}`;

  useEffect(() => {
    void store.load().catch(() => undefined);
    return () => store.dispose();
  }, [store]);

  const adapter = useMemo(
    () => ({
      messages: projection.messages,
      isDisabled: true,
      isSendDisabled: true,
      isLoading:
        projection.status === "loading" || projection.status === "idle",
      isRunning: projection.runtime.status === "running",
      onNew: async () => {
        throw readOnlyActionError;
      },
      convertMessage: (message: SavedConversationMessage) =>
        toAssistantThreadMessage(message, projection),
      unstable_enableToolInvocations: false,
    }),
    [projection],
  );
  const runtime = useExternalStoreRuntime(adapter);

  return (
    <AssistantRuntimeProvider key={sessionKey} runtime={runtime}>
      <Thread
        state={threadState(projection.status)}
        {...(projection.error?.message === undefined
          ? {}
          : { errorMessage: projection.error.message })}
      />
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
