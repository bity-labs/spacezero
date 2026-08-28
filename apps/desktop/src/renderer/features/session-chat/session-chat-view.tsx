import { Button } from "@spacezero/ui/components/button";
import type { SessionMessage } from "@spacezero/host-contracts";
import { useState, type FormEvent, type ReactElement } from "react";

export interface SessionChatViewProps {
  readonly sessionName: string;
  readonly status: "loading" | "ready" | "error";
  readonly loadError?: string;
  readonly messages: readonly SessionMessage[];
  readonly showSourceWarning: boolean;
  readonly sourceDescription: string;
  readonly busy: boolean;
  readonly promptError: string | null;
  readonly onSubmitPrompt: (prompt: string) => void;
  readonly onBack: () => void;
}

export const SessionChatView = ({
  sessionName,
  status,
  loadError,
  messages,
  showSourceWarning,
  sourceDescription,
  busy,
  promptError,
  onSubmitPrompt,
  onBack,
}: SessionChatViewProps): ReactElement => {
  const [prompt, setPrompt] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length === 0 || busy) return;
    onSubmitPrompt(trimmed);
    setPrompt("");
  };
  return (
    <section className="session-chat" aria-labelledby="session-chat-title">
      <div className="session-chat__header">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back to Projects
        </Button>
        <h2 id="session-chat-title">{sessionName}</h2>
      </div>
      {status === "loading" ? (
        <p role="status">Loading Session messages…</p>
      ) : null}
      {status === "error" ? <p role="alert">{loadError}</p> : null}
      {status === "ready" ? (
        <>
          {messages.length === 0 ? <p>No messages yet.</p> : null}
          <ol className="session-chat__messages" aria-label="Session messages">
            {messages.map((entry) => (
              <li
                key={entry.id}
                data-testid="session-chat-message"
                className={`session-chat__message session-chat__message--${entry.role}`}
              >
                <span className="session-chat__role">
                  {entry.role === "user" ? "You" : "Agent"}
                </span>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
          {showSourceWarning ? (
            <p role="alert" className="session-chat__warning">
              This Session used committed HEAD and excluded uncommitted base
              checkout changes (
              <span className="session-chat__source">{sourceDescription}</span>
              ). Submitting a prompt proceeds with that recorded source state.
            </p>
          ) : null}
          {promptError ? (
            <p
              role="alert"
              aria-label="Prompt error"
              className="session-chat__error"
            >
              {promptError}
            </p>
          ) : null}
          <form className="session-chat__form" onSubmit={submit}>
            <label htmlFor="session-chat-prompt">Prompt</label>
            <textarea
              id="session-chat-prompt"
              aria-label="Prompt"
              rows={3}
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <Button type="submit" disabled={busy} size="sm">
              {busy ? "Sending…" : "Send prompt"}
            </Button>
          </form>
        </>
      ) : null}
    </section>
  );
};
