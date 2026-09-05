import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type ThreadAssistantMessagePart,
  type ThreadMessage,
  type ThreadUserMessagePart,
} from "@assistant-ui/react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "#lib/utils";

export type ThreadViewState =
  "loading" | "empty" | "ready" | "unavailable" | "error";

export interface ThreadLabels {
  readonly transcript?: string;
  readonly loading?: string;
  readonly empty?: string;
  readonly unavailable?: string;
  readonly error?: string;
  readonly unsupportedPart?: string;
  readonly user?: string;
  readonly assistant?: string;
  readonly composer?: string;
  readonly send?: string;
  readonly stop?: string;
}

export interface ThreadProps {
  readonly state?: ThreadViewState;
  readonly errorMessage?: string;
  readonly labels?: ThreadLabels;
  readonly className?: string;
}

const defaultLabels = {
  transcript: "Conversation transcript",
  loading: "Loading conversation…",
  empty: "No saved messages yet.",
  unavailable: "Conversation unavailable.",
  error: "Conversation failed to load.",
  unsupportedPart: "This saved content is unavailable in this view.",
  user: "You",
  assistant: "Assistant",
  composer: "Message",
  send: "Send",
  stop: "Stop",
} satisfies Required<ThreadLabels>;

type RenderablePart = ThreadUserMessagePart | ThreadAssistantMessagePart;

const isTextPart = (
  part: RenderablePart,
): part is Extract<RenderablePart, { readonly type: "text" | "reasoning" }> =>
  part.type === "text" || part.type === "reasoning";

const renderPart = (
  part: RenderablePart,
  labels: Required<ThreadLabels>,
  index: number,
): ReactNode => {
  if (isTextPart(part))
    return (
      <p key={index} className="whitespace-pre-wrap leading-6">
        {part.text}
      </p>
    );
  if (part.type === "tool-call")
    return (
      <div
        key={part.toolCallId}
        className="rounded-md border border-border bg-muted/40 p-3 text-xs"
      >
        <div className="font-medium">Tool: {part.toolName}</div>
        <div className="mt-1 text-muted-foreground">
          {labels.unsupportedPart}
        </div>
      </div>
    );
  return (
    <div
      key={index}
      className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
    >
      {labels.unsupportedPart}
    </div>
  );
};

const ThreadMessageView = ({
  message,
  labels,
}: {
  readonly message: ThreadMessage;
  readonly labels: Required<ThreadLabels>;
}): ReactElement => {
  const isUser = message.role === "user";
  const parts = message.content as readonly RenderablePart[];
  return (
    <MessagePrimitive.Root
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border p-4 text-sm shadow-sm",
        isUser
          ? "border-primary/20 bg-primary/5 text-foreground"
          : "border-border bg-card text-card-foreground",
      )}
      data-role={message.role}
    >
      <div className="text-xs font-medium text-muted-foreground">
        {isUser ? labels.user : labels.assistant}
      </div>
      <div className="space-y-3">
        {parts.map((part, index) => renderPart(part, labels, index))}
      </div>
    </MessagePrimitive.Root>
  );
};

const ThreadComposer = ({
  labels,
}: {
  readonly labels: Required<ThreadLabels>;
}): ReactElement => (
  <ComposerPrimitive.Root className="border-t border-border p-4">
    <div className="flex items-end gap-2 rounded-lg border border-input bg-background p-2 shadow-sm">
      <ComposerPrimitive.Input
        aria-label={labels.composer}
        placeholder={labels.composer}
        className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />
      <ComposerPrimitive.Send className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50">
        {labels.send}
      </ComposerPrimitive.Send>
      <ComposerPrimitive.Cancel className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50">
        {labels.stop}
      </ComposerPrimitive.Cancel>
    </div>
  </ComposerPrimitive.Root>
);

export function Thread({
  state = "ready",
  errorMessage,
  labels: labelOverrides,
  className,
}: ThreadProps): ReactElement {
  const labels = { ...defaultLabels, ...labelOverrides };
  return (
    <section
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      aria-label={labels.transcript}
    >
      {state === "loading" ? (
        <div
          role="status"
          className="border-b border-border px-4 py-3 text-sm text-muted-foreground"
        >
          {labels.loading}
        </div>
      ) : null}
      {state === "unavailable" ? (
        <div
          role="status"
          className="border-b border-border px-4 py-3 text-sm text-muted-foreground"
        >
          {labels.unavailable}
        </div>
      ) : null}
      {state === "error" ? (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage ?? labels.error}
        </div>
      ) : null}
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto p-4">
          <ThreadPrimitive.Empty>
            {state === "empty" ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
                {labels.empty}
              </div>
            ) : null}
          </ThreadPrimitive.Empty>
          <div className="space-y-4">
            <ThreadPrimitive.Messages>
              {({ message }) => (
                <ThreadMessageView message={message} labels={labels} />
              )}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>
        {state === "unavailable" ? null : <ThreadComposer labels={labels} />}
      </ThreadPrimitive.Root>
    </section>
  );
}
