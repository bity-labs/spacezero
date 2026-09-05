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
  readonly toolArguments?: string;
  readonly toolResult?: string;
  readonly toolProgress?: string;
  readonly toolTruncated?: string;
  readonly toolNoOutput?: string;
  readonly user?: string;
  readonly assistant?: string;
  readonly composer?: string;
  readonly send?: string;
  readonly stop?: string;
  readonly queuedFollowUps?: string;
  readonly cancelQueuedFollowUp?: string;
  readonly followUpQueued?: string;
  readonly followUpDispatched?: string;
  readonly followUpConsumed?: string;
  readonly followUpCancelled?: string;
  readonly followUpRecoveryRequired?: string;
  readonly followUpPending?: string;
  readonly followUpFailed?: string;
}

export interface ThreadQueueItem {
  readonly id: string;
  readonly prompt: string;
  readonly state:
    "queued" | "dispatched" | "consumed" | "cancelled" | "recovery_required";
  readonly position: number;
  readonly status?: "pending" | "failed";
  readonly errorMessage?: string;
}

export interface ThreadProps {
  readonly state?: ThreadViewState;
  readonly errorMessage?: string;
  readonly labels?: ThreadLabels;
  readonly className?: string;
  readonly queueItems?: readonly ThreadQueueItem[];
  readonly onCancelQueueItem?: (id: string) => void | Promise<void>;
  readonly isRunning?: boolean;
  readonly onStop?: () => void | Promise<void>;
}

const defaultLabels = {
  transcript: "Conversation transcript",
  loading: "Loading conversation…",
  empty: "No saved messages yet.",
  unavailable: "Conversation unavailable.",
  error: "Conversation failed to load.",
  unsupportedPart: "This saved content is unavailable in this view.",
  toolArguments: "Arguments",
  toolResult: "Result",
  toolProgress: "Progress",
  toolTruncated: "Output was truncated by the tool provider.",
  toolNoOutput: "No displayable output.",
  user: "You",
  assistant: "Assistant",
  composer: "Message",
  send: "Send",
  stop: "Stop",
  queuedFollowUps: "Queued follow-ups",
  cancelQueuedFollowUp: "Cancel follow-up",
  followUpQueued: "Queued",
  followUpDispatched: "Dispatching",
  followUpConsumed: "Consumed",
  followUpCancelled: "Cancelled",
  followUpRecoveryRequired: "Recovery required",
  followUpPending: "Saving…",
  followUpFailed: "Failed to queue",
} satisfies Required<ThreadLabels>;

type ToolDisplayContent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image";
      readonly data: string;
      readonly mimeType:
        "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    }
  | {
      readonly type: "unsupported";
      readonly label: string;
    };

type ToolDisplayResult = {
  readonly content: readonly ToolDisplayContent[];
  readonly truncated?: boolean;
};

type RenderableToolCallPart = {
  readonly type: "tool-call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status?: "running" | "succeeded" | "failed";
  readonly args?: unknown;
  readonly progress?: string;
  readonly result?: ToolDisplayResult;
  readonly safety?: "read" | "write" | "dangerous";
  readonly approvalStatus?: "approved" | "requires_approval";
  readonly approvalReason?: string;
};

type RenderablePart =
  ThreadUserMessagePart | ThreadAssistantMessagePart | RenderableToolCallPart;

const isTextPart = (
  part: RenderablePart,
): part is Extract<RenderablePart, { readonly type: "text" }> =>
  part.type === "text";

const isReasoningPart = (
  part: RenderablePart,
): part is Extract<RenderablePart, { readonly type: "reasoning" }> =>
  part.type === "reasoning";

const isToolCallPart = (part: RenderablePart): part is RenderableToolCallPart =>
  part.type === "tool-call";

const renderToolResult = (result: ToolDisplayResult): ReactNode => (
  <div className="space-y-2">
    {result.content.map((content, index) => {
      if (content.type === "text")
        return (
          <pre
            key={index}
            className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2"
          >
            {content.text}
          </pre>
        );
      if (content.type === "image")
        return (
          <img
            key={index}
            alt={`Tool result image (${content.mimeType})`}
            src={`data:${content.mimeType};base64,${content.data}`}
            loading="lazy"
            decoding="async"
            className="max-h-96 max-w-full rounded border border-border bg-background object-contain"
          />
        );
      return (
        <div
          key={index}
          className="rounded border border-border bg-background p-2 text-muted-foreground"
        >
          {content.label}
        </div>
      );
    })}
  </div>
);

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
  if (isReasoningPart(part))
    return (
      <details
        key={index}
        className="rounded-md border border-border bg-muted/40 p-3 text-xs"
      >
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Reasoning
        </summary>
        <p className="mt-2 whitespace-pre-wrap leading-5 text-muted-foreground">
          {part.text}
        </p>
      </details>
    );
  if (isToolCallPart(part))
    return (
      <details
        key={part.toolCallId}
        className="rounded-md border border-border bg-muted/40 p-3 text-xs"
      >
        <summary className="cursor-pointer font-medium">
          Tool: {part.toolName}
          {part.status ? ` · ${part.status}` : ""}
        </summary>
        <div className="mt-2 space-y-3 text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            {part.safety ? <span>Safety: {part.safety}</span> : null}
            {part.approvalStatus ? (
              <span>Approval: {part.approvalStatus}</span>
            ) : null}
            {part.approvalReason ? <span>{part.approvalReason}</span> : null}
          </div>
          {part.args === undefined ? null : (
            <div>
              <div className="mb-1 font-medium">{labels.toolArguments}</div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2">
                {JSON.stringify(part.args, null, 2)}
              </pre>
            </div>
          )}
          {part.progress ? (
            <div>
              <div className="mb-1 font-medium">{labels.toolProgress}</div>
              <div>{part.progress}</div>
            </div>
          ) : null}
          {part.result === undefined ? null : (
            <div>
              <div className="mb-1 font-medium">{labels.toolResult}</div>
              {part.result.content.length > 0 ? (
                renderToolResult(part.result)
              ) : (
                <div>{labels.toolNoOutput}</div>
              )}
              {part.result.truncated ? (
                <div className="mt-2">{labels.toolTruncated}</div>
              ) : null}
            </div>
          )}
        </div>
      </details>
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

const followUpLabel = (
  item: ThreadQueueItem,
  labels: Required<ThreadLabels>,
): string => {
  if (item.status === "pending") return labels.followUpPending;
  if (item.status === "failed") return labels.followUpFailed;
  switch (item.state) {
    case "queued":
      return labels.followUpQueued;
    case "dispatched":
      return labels.followUpDispatched;
    case "consumed":
      return labels.followUpConsumed;
    case "cancelled":
      return labels.followUpCancelled;
    case "recovery_required":
      return labels.followUpRecoveryRequired;
  }
};

const ThreadQueue = ({
  items,
  labels,
  onCancel,
}: {
  readonly items: readonly ThreadQueueItem[];
  readonly labels: Required<ThreadLabels>;
  readonly onCancel?: (id: string) => void | Promise<void>;
}): ReactElement | null => {
  if (items.length === 0) return null;
  return (
    <section
      aria-label={labels.queuedFollowUps}
      className="border-t border-border bg-muted/30 px-4 py-3 text-sm"
    >
      <div className="mb-2 font-medium text-muted-foreground">
        {labels.queuedFollowUps}
      </div>
      <ol className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">
                #{item.position} · {followUpLabel(item, labels)}
              </div>
              <div className="mt-1 whitespace-pre-wrap">{item.prompt}</div>
              {item.errorMessage ? (
                <div role="alert" className="mt-1 text-xs text-destructive">
                  {item.errorMessage}
                </div>
              ) : null}
            </div>
            {item.state === "queued" && item.status !== "pending" ? (
              <button
                type="button"
                className="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => {
                  void onCancel?.(item.id);
                }}
                disabled={!onCancel}
              >
                {labels.cancelQueuedFollowUp}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
};

const ThreadComposer = ({
  labels,
  isRunning,
  onStop,
}: {
  readonly labels: Required<ThreadLabels>;
  readonly isRunning: boolean;
  readonly onStop?: () => void | Promise<void>;
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
      {isRunning && onStop ? (
        <button
          type="button"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          onClick={() => {
            void onStop();
          }}
        >
          {labels.stop}
        </button>
      ) : null}
    </div>
  </ComposerPrimitive.Root>
);

export function Thread({
  state = "ready",
  errorMessage,
  labels: labelOverrides,
  className,
  queueItems = [],
  onCancelQueueItem,
  isRunning = false,
  onStop,
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
        <ThreadQueue
          items={queueItems}
          labels={labels}
          {...(onCancelQueueItem === undefined
            ? {}
            : { onCancel: onCancelQueueItem })}
        />
        {state === "unavailable" ? null : (
          <ThreadComposer
            labels={labels}
            isRunning={isRunning}
            {...(onStop === undefined ? {} : { onStop })}
          />
        )}
      </ThreadPrimitive.Root>
    </section>
  );
}
