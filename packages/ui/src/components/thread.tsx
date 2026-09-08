import {
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  type ThreadAssistantMessagePart,
  type ThreadMessage,
  type ThreadUserMessagePart,
} from "@assistant-ui/react";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  Composer,
  ComposerActions,
  ComposerBar,
  ComposerContext,
  ComposerInput,
  ComposerSend,
  ComposerToolbar,
  type ComposerUsage,
} from "./assistant-ui/elements/composer";
import { GenerationLoader } from "./assistant-ui/elements/loading-state";
import { ThinkingIndicator } from "./assistant-ui/elements/thinking-indicator";
import { TypingIndicator } from "./assistant-ui/elements/typing-indicator";
import { paper } from "./assistant-ui/elements/surfaces";
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
  readonly loadOlder?: string;
  readonly loadingOlder?: string;
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
  readonly hasMoreOlder?: boolean;
  readonly isLoadingOlder?: boolean;
  readonly onLoadOlder?: () => void | Promise<void>;
  readonly onStop?: () => void | Promise<void>;
  readonly composerStartContent?: ReactNode;
  readonly composerContextUsage?: ComposerUsage;
  readonly assistantActivityLabel?: string;
  readonly showAssistantLoader?: boolean;
}

const defaultLabels = {
  transcript: "Conversation transcript",
  loading: "Loading chat",
  empty: "No saved messages yet.",
  unavailable: "Conversation unavailable.",
  error: "Conversation failed to load.",
  unsupportedPart: "This saved content is unavailable in this view.",
  toolArguments: "Arguments",
  toolResult: "Result",
  toolProgress: "Progress",
  toolTruncated: "Output was truncated by the tool provider.",
  toolNoOutput: "No displayable output.",
  loadOlder: "Load older messages",
  loadingOlder: "Loading older messages…",
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
        "flex w-full flex-col gap-2 text-sm",
        isUser ? "items-end" : "items-start",
      )}
      data-role={message.role}
    >
      <div className="sr-only">{isUser ? labels.user : labels.assistant}</div>
      <div
        className={cn(
          "space-y-3",
          isUser
            ? cn(paper, "max-w-[85%] rounded-2xl px-3.5 py-2")
            : "max-w-[85%] text-foreground/90",
        )}
      >
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

const useLoadingTick = (active: boolean): number => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setTick((current) => current + 1), 120);
    return () => window.clearInterval(id);
  }, [active]);

  return tick;
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
  startContent,
  contextUsage,
}: {
  readonly labels: Required<ThreadLabels>;
  readonly isRunning: boolean;
  readonly onStop?: () => void | Promise<void>;
  readonly startContent?: ReactNode;
  readonly contextUsage?: ComposerUsage;
}): ReactElement => {
  const aui = useAui();
  const threadIsRunning = useAuiState((state) => state.thread.isRunning);
  const threadIsDisabled = useAuiState((state) => state.thread.isDisabled);
  const inputRef = useRef<HTMLInputElement>(null);
  const composerText = useAuiState((state) => state.composer.text);
  const composerCanSend = useAuiState((state) => state.composer.canSend);
  const running = isRunning || threadIsRunning;
  const canSend = composerCanSend && !threadIsDisabled;

  useEffect(() => {
    if (!threadIsDisabled) inputRef.current?.focus();
  }, [threadIsDisabled]);

  return (
    <div className="p-4">
      <Composer className="w-full max-w-none">
        <ComposerBar>
          <ComposerInput
            ref={inputRef}
            aria-label={labels.composer}
            placeholder={labels.composer}
            value={composerText}
            disabled={threadIsDisabled}
            autoFocus
            onChange={(event) => {
              aui.composer.setText(event.target.value);
            }}
            onSubmit={() => {
              if (canSend) aui.composer.send();
            }}
          />
          <ComposerToolbar>
            <ComposerActions>
              {startContent}
              {contextUsage ? <ComposerContext usage={contextUsage} /> : null}
            </ComposerActions>
            <ComposerActions>
              {running && onStop ? (
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
              <ComposerSend
                streaming={running}
                idle={canSend}
                disabled={!canSend}
                aria-label={labels.send}
                onClick={() => {
                  if (canSend) aui.composer.send();
                }}
              />
            </ComposerActions>
          </ComposerToolbar>
        </ComposerBar>
      </Composer>
    </div>
  );
};

export function Thread({
  state = "ready",
  errorMessage,
  labels: labelOverrides,
  className,
  queueItems = [],
  onCancelQueueItem,
  isRunning = false,
  hasMoreOlder = false,
  isLoadingOlder = false,
  onLoadOlder,
  onStop,
  composerStartContent,
  composerContextUsage,
  assistantActivityLabel,
  showAssistantLoader = false,
}: ThreadProps): ReactElement {
  const labels = { ...defaultLabels, ...labelOverrides };
  const loadingTick = useLoadingTick(state === "loading");
  return (
    <section
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      aria-label={labels.transcript}
    >
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
          {hasMoreOlder || isLoadingOlder ? (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                className="rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => {
                  void onLoadOlder?.();
                }}
                disabled={isLoadingOlder || !onLoadOlder}
              >
                {isLoadingOlder ? labels.loadingOlder : labels.loadOlder}
              </button>
            </div>
          ) : null}
          {state === "loading" ? (
            <div className="flex min-h-40 items-center justify-center py-10">
              <GenerationLoader
                role="status"
                label={labels.loading}
                tick={loadingTick}
              />
            </div>
          ) : null}
          <ThreadPrimitive.Empty>
            {state === "empty" ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
                {labels.empty}
              </div>
            ) : null}
          </ThreadPrimitive.Empty>
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            <ThreadPrimitive.Messages>
              {({ message }) => (
                <ThreadMessageView message={message} labels={labels} />
              )}
            </ThreadPrimitive.Messages>
            {assistantActivityLabel ? (
              <ThinkingIndicator label={assistantActivityLabel} />
            ) : showAssistantLoader ? (
              <TypingIndicator />
            ) : null}
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
            {...(composerStartContent === undefined
              ? {}
              : { startContent: composerStartContent })}
            {...(composerContextUsage === undefined
              ? {}
              : { contextUsage: composerContextUsage })}
          />
        )}
      </ThreadPrimitive.Root>
    </section>
  );
}
