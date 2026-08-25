import { createProjectSessionClient } from "@spacezero/client-runtime";
import type {
  ProjectSessionError,
  ProjectSessionSummary,
  SessionMessage,
} from "@spacezero/host-contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { SessionChatView } from "./session-chat-view.js";

const isPublicHostError = (error: unknown): error is ProjectSessionError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  "message" in error &&
  typeof (error as { readonly code?: unknown }).code === "string" &&
  typeof (error as { readonly message?: unknown }).message === "string";

const shortCommit = (commit: string): string => commit.slice(0, 8);

export interface SessionChatContainerProps {
  readonly session: ProjectSessionSummary;
  readonly onBack: () => void;
}

export const SessionChatContainer = ({
  session,
  onBack,
}: SessionChatContainerProps): ReactElement => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [messages, setMessages] = useState<readonly SessionMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const client = useMemo(
    () =>
      createProjectSessionClient({
        getConnectionDescriptor: window.spacezero.getLocalHostConnection,
      }),
    [],
  );
  useEffect(() => {
    let mounted = true;
    client.listSessionMessages(session.id).then(
      (result) => {
        if (!mounted) return;
        setMessages(result.messages);
        setStatus("ready");
      },
      () => {
        if (mounted) setStatus("error");
      },
    );
    return () => {
      mounted = false;
    };
  }, [client, session.id]);
  const submitPrompt = useCallback(
    async (prompt: string) => {
      setBusy(true);
      setPromptError(null);
      try {
        const result = await client.submitPrompt(session.id, prompt);
        setMessages((current) => [
          ...current,
          result.userMessage,
          result.agentMessage,
        ]);
      } catch (error) {
        setPromptError(
          isPublicHostError(error)
            ? error.message
            : "The prompt could not be submitted. Try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [client, session.id],
  );
  const hasUserMessage = messages.some((entry) => entry.role === "user");
  const sourceDescription = `${
    session.sourceDetached
      ? "detached HEAD"
      : (session.sourceBranch ?? "unknown branch")
  } @ ${shortCommit(session.sourceCommit)}`;
  return (
    <SessionChatView
      sessionName={session.name}
      status={status}
      loadError="Session messages are unavailable. Try again."
      messages={messages}
      showSourceWarning={session.uncommittedChangesExcluded && !hasUserMessage}
      sourceDescription={sourceDescription}
      busy={busy}
      promptError={promptError}
      onSubmitPrompt={submitPrompt}
      onBack={onBack}
    />
  );
};
