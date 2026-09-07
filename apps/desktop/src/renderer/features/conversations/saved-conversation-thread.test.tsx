import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGlobalChatSessionSavedConversationStore,
  createSavedConversationStore,
  type GlobalChatSessionClient,
  type SavedConversationStore,
} from "@spacezero/client-runtime";
import { SavedConversationThread } from "./saved-conversation-thread.js";

const loadedStore = (input: {
  readonly kind: "project" | "global";
  readonly sessionId: string;
  readonly title: string;
  readonly messages: readonly {
    readonly id: string;
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly sequence: number;
    readonly createdAt: string;
    readonly parts?: readonly (
      | {
          readonly id: string;
          readonly type: "text" | "reasoning";
          readonly order: number;
          readonly text: string;
          readonly turnId?: string;
        }
      | {
          readonly id: string;
          readonly type: "tool-call";
          readonly order: number;
          readonly turnId?: string;
          readonly toolCallId: string;
          readonly toolName: string;
          readonly status: "running" | "succeeded" | "failed";
          readonly arguments?: Record<string, string>;
          readonly progress?: string;
          readonly result?: {
            readonly content: readonly (
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
                }
            )[];
            readonly truncated?: boolean;
          };
          readonly safety?: "read" | "write" | "dangerous";
          readonly approvalStatus?: "approved" | "requires_approval";
          readonly approvalReason?: string;
        }
    )[];
  }[];
}): SavedConversationStore =>
  createSavedConversationStore({
    kind: input.kind,
    sessionId: input.sessionId,
    load: async () => ({
      title: input.title,
      lastSequence: input.messages.at(-1)?.sequence ?? 0,
      messages: input.messages,
    }),
  });

const timestamp = "2026-01-01T00:00:00.000Z";

describe("SavedConversationThread", () => {
  afterEach(() => cleanup());

  it("finishes loading and enables draft sending under React StrictMode", async () => {
    const store = createSavedConversationStore({
      kind: "global",
      sessionId: "global-draft",
      load: async () => ({ title: "New chat", lastSequence: 0, messages: [] }),
      submitPrompt: vi.fn(),
    });

    render(
      <StrictMode>
        <SavedConversationThread store={store} />
      </StrictMode>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading chat");
    expect(
      await screen.findByText("No saved messages yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("loads Project Session saved messages into the shared Thread and leaves unsupported actions inactive", async () => {
    const store = loadedStore({
      kind: "project",
      sessionId: "project-session-1",
      title: "margaux",
      messages: [
        {
          id: "user-message-1",
          role: "user",
          text: "What changed?",
          sequence: 2,
          createdAt: timestamp,
        },
        {
          id: "assistant-message-1",
          role: "assistant",
          text: "Saved **answer** from the Host.",
          sequence: 3,
          createdAt: timestamp,
        },
      ],
    });

    render(<SavedConversationThread store={store} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading chat");
    expect(await screen.findByText("What changed?")).toBeInTheDocument();
    expect(
      screen.getByText("Saved **answer** from the Host."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Conversation transcript"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("renders multiple assistant messages from one Host turn as distinct transcript messages", async () => {
    const store = loadedStore({
      kind: "global",
      sessionId: "global-session-1",
      title: "Global chat",
      messages: [
        {
          id: "user-message-1",
          role: "user",
          text: "Explain the plan",
          sequence: 1,
          createdAt: timestamp,
        },
        {
          id: "assistant-message-1",
          role: "assistant",
          text: "First assistant boundary",
          sequence: 2,
          createdAt: timestamp,
          parts: [
            {
              id: "assistant-message-1:text:1",
              type: "text",
              order: 1,
              text: "First assistant boundary",
              turnId: "turn-1",
            },
          ],
        },
        {
          id: "assistant-message-2",
          role: "assistant",
          text: "Second assistant boundary",
          sequence: 3,
          createdAt: timestamp,
          parts: [
            {
              id: "assistant-message-2:text:1",
              type: "text",
              order: 1,
              text: "Second assistant boundary",
              turnId: "turn-1",
            },
          ],
        },
      ],
    });

    render(<SavedConversationThread store={store} />);

    expect(
      await screen.findByText("First assistant boundary"),
    ).toBeInTheDocument();
    expect(screen.getByText("Second assistant boundary")).toBeInTheDocument();
  });

  it("renders provider-exposed reasoning as expandable content separate from answer text", async () => {
    const store = loadedStore({
      kind: "project",
      sessionId: "project-session-1",
      title: "margaux",
      messages: [
        {
          id: "assistant-message-1",
          role: "assistant",
          text: "Final answer",
          sequence: 2,
          createdAt: timestamp,
          parts: [
            {
              id: "assistant-message-1:reasoning:1",
              type: "reasoning",
              order: 1,
              text: "Provider-exposed reasoning",
            },
            {
              id: "assistant-message-1:text:2",
              type: "text",
              order: 2,
              text: "Final answer",
            },
          ],
        },
      ],
    });

    render(<SavedConversationThread store={store} />);

    expect(await screen.findByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByText("Provider-exposed reasoning")).toBeInTheDocument();
    expect(screen.getByText("Final answer")).toBeInTheDocument();
  });

  it("renders sanitized tool arguments, progress, result, and status without executing tools", async () => {
    const store = loadedStore({
      kind: "project",
      sessionId: "project-session-1",
      title: "margaux",
      messages: [
        {
          id: "assistant-message-1",
          role: "assistant",
          text: "Done",
          sequence: 2,
          createdAt: timestamp,
          parts: [
            {
              id: "assistant-message-1:tool-call:call-1",
              type: "tool-call",
              order: 1,
              turnId: "turn-1",
              toolCallId: "call-1",
              toolName: "read",
              status: "succeeded",
              arguments: { path: "src/app.ts", apiKey: "[redacted]" },
              progress: "Reading file",
              result: {
                content: [
                  {
                    type: "text",
                    text: "<script>alert('not executable')</script>",
                  },
                ],
                truncated: true,
              },
              safety: "read",
              approvalStatus: "approved",
            },
            {
              id: "assistant-message-1:text:2",
              type: "text",
              order: 2,
              text: "Done",
            },
          ],
        },
      ],
    });

    render(<SavedConversationThread store={store} />);

    expect(
      await screen.findByText("Tool: read · succeeded"),
    ).toBeInTheDocument();
    expect(screen.getByText(/"path": "src\/app\.ts"/u)).toBeInTheDocument();
    expect(screen.getByText(/"apiKey": "\[redacted\]"/u)).toBeInTheDocument();
    expect(screen.getByText("Reading file")).toBeInTheDocument();
    expect(
      screen.getByText("<script>alert('not executable')</script>"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Output was truncated by the tool provider."),
    ).toBeInTheDocument();
  });

  it("renders safe image tool results and explicit unsupported-content fallbacks", async () => {
    const store = loadedStore({
      kind: "global",
      sessionId: "global-session-1",
      title: "Global prompt",
      messages: [
        {
          id: "global-assistant-message-1",
          role: "assistant",
          text: "Generated image",
          sequence: 1,
          createdAt: timestamp,
          parts: [
            {
              id: "global-assistant-message-1:tool-call:image-call",
              type: "tool-call",
              order: 1,
              toolCallId: "image-call",
              toolName: "image.preview",
              status: "succeeded",
              result: {
                content: [
                  {
                    type: "image",
                    mimeType: "image/png",
                    data: "iVBORw0KGgo=",
                  },
                  {
                    type: "unsupported",
                    label: "Unsupported tool result content type: html.",
                  },
                ],
              },
            },
            {
              id: "global-assistant-message-1:text:2",
              type: "text",
              order: 2,
              text: "Generated image",
            },
          ],
        },
      ],
    });

    render(<SavedConversationThread store={store} />);

    const image = await screen.findByAltText("Tool result image (image/png)");
    expect(image).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    expect(
      screen.getByText("Unsupported tool result content type: html."),
    ).toBeInTheDocument();
  });

  it.each(["project", "global"] as const)(
    "shows an honest %s conversation storage recovery state",
    async (kind) => {
      const store = createSavedConversationStore({
        kind,
        sessionId: `${kind}-session-1`,
        load: async () => ({
          title: kind === "project" ? "margaux" : "Global prompt",
          lastSequence: 2,
          messages: [
            {
              id: "message-1",
              role: "user" as const,
              text: "Persisted prompt",
              sequence: 1,
              createdAt: timestamp,
            },
          ],
          activeTurn: {
            id: "turn-1",
            commandId: "command-1",
            state: "recovery_required" as const,
            userMessageId: "message-1",
            assistantMessageId: "assistant-message-1",
            assistantMessageIds: ["assistant-message-1"],
            draftMessages: [],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "",
            failureReason:
              kind === "project"
                ? "session_recovery_required"
                : "global_chat_session_recovery_required",
            failureCategory: "system" as const,
            retryable: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        }),
      });

      render(<SavedConversationThread store={store} />);

      expect(await screen.findByText("Persisted prompt")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Conversation storage failed or requires recovery/u,
      );
      expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: /stop/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("uses the same Thread for Global Chat saved messages", async () => {
    const store = loadedStore({
      kind: "global",
      sessionId: "global-session-1",
      title: "Global prompt",
      messages: [
        {
          id: "global-user-message-1",
          role: "user",
          text: "Global question",
          sequence: 1,
          createdAt: timestamp,
        },
      ],
    });

    render(<SavedConversationThread store={store} />);

    expect(await screen.findByText("Global question")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Conversation transcript"),
    ).toBeInTheDocument();
  });

  it("does not leak messages when switching stores", async () => {
    const firstStore = loadedStore({
      kind: "project",
      sessionId: "project-session-1",
      title: "margaux",
      messages: [
        {
          id: "project-message-1",
          role: "user",
          text: "Project-only history",
          sequence: 1,
          createdAt: timestamp,
        },
      ],
    });
    const secondStore = loadedStore({
      kind: "global",
      sessionId: "global-session-1",
      title: "Global prompt",
      messages: [
        {
          id: "global-message-1",
          role: "assistant",
          text: "Global-only history",
          sequence: 1,
          createdAt: timestamp,
        },
      ],
    });
    const { rerender } = render(<SavedConversationThread store={firstStore} />);
    expect(await screen.findByText("Project-only history")).toBeInTheDocument();

    rerender(<SavedConversationThread store={secondStore} />);

    expect(await screen.findByText("Global-only history")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("Project-only history"),
      ).not.toBeInTheDocument();
    });
  });

  it("submits composer text through the Host-backed store and renders the pending prompt", async () => {
    const submitted: string[] = [];
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load: async () => ({ title: "margaux", lastSequence: 0, messages: [] }),
      submitPrompt: async ({ prompt, commandId }) => {
        submitted.push(prompt);
        return {
          session: {
            id: "project-session-1",
            projectId: "project-1",
            name: "margaux",
            state: "ready" as const,
            sourceBranch: "main",
            sourceDetached: false,
            sourceCommit: "a".repeat(40),
            uncommittedChangesExcluded: false,
            managedBranch:
              "spacezero/margaux-11111111-1111-4111-8111-111111111111",
            createdAt: timestamp,
            updatedAt: timestamp,
            lastSequence: 2,
          },
          userMessage: {
            id: "host-user-message-1",
            role: "user" as const,
            text: prompt,
            sequence: 1,
            createdAt: timestamp,
            parts: [
              {
                id: "host-user-message-1:text:1",
                type: "text" as const,
                order: 1,
                text: prompt,
              },
            ],
          },
          turn: {
            id: "turn-1",
            commandId,
            state: "running" as const,
            userMessageId: "host-user-message-1",
            assistantMessageId: "assistant-message-1",
            assistantMessageIds: ["assistant-message-1"],
            draftMessages: [],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      },
    });

    render(<SavedConversationThread store={store} />);

    const input = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "Build live streaming" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Build live streaming")).toBeInTheDocument();
    await waitFor(() => expect(submitted).toEqual(["Build live streaming"]));
  });

  it("loads an existing Global Chat and sends a later prompt to the same Session", async () => {
    const submitted: { sessionId: string; prompt: string }[] = [];
    const store = createGlobalChatSessionSavedConversationStore({
      client: {
        listMessages: async (sessionId: string) => {
          expect(sessionId).toBe("global-session-existing");
          return {
            session: {
              id: "global-session-existing",
              title: "Existing global chat",
              archived: false,
              createdAt: timestamp,
              updatedAt: timestamp,
              lastSequence: 3,
            },
            messages: [
              {
                id: "global-history-user-1",
                role: "user" as const,
                text: "First chat question",
                sequence: 2,
                createdAt: timestamp,
              },
              {
                id: "global-history-assistant-1",
                role: "assistant" as const,
                text: "First chat answer",
                sequence: 3,
                createdAt: timestamp,
              },
            ],
          };
        },
        submitPrompt: async (
          sessionId: string,
          prompt: string,
          commandId: string,
        ) => {
          submitted.push({ sessionId, prompt });
          return {
            session: {
              id: sessionId,
              title: "Existing global chat",
              archived: false,
              createdAt: timestamp,
              updatedAt: timestamp,
              lastSequence: 6,
            },
            userMessage: {
              id: "global-history-user-2",
              role: "user" as const,
              text: prompt,
              sequence: 5,
              createdAt: timestamp,
              commandId,
            },
            turn: {
              id: "global-history-turn-2",
              commandId,
              state: "running" as const,
              userMessageId: "global-history-user-2",
              assistantMessageId: "global-history-assistant-2",
              assistantMessageIds: ["global-history-assistant-2"],
              draftMessages: [],
              providerId: "anthropic",
              modelId: "claude-sonnet-4-5",
              thinkingLevel: "off" as const,
              draftText: "",
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          };
        },
      } as unknown as GlobalChatSessionClient,
      sessionId: "global-session-existing",
    });

    render(<SavedConversationThread store={store} />);

    expect(await screen.findByText("First chat question")).toBeInTheDocument();
    expect(screen.getByText("First chat answer")).toBeInTheDocument();

    const input = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(input, {
      target: { value: "Second chat question" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Second chat question")).toBeInTheDocument();
    await waitFor(() =>
      expect(submitted).toEqual([
        {
          sessionId: "global-session-existing",
          prompt: "Second chat question",
        },
      ]),
    );
  });

  it("shows the latest sanitized tool summary in the running status banner", async () => {
    const store = createSavedConversationStore({
      kind: "global",
      sessionId: "global-chat-1",
      load: async () => ({
        title: "status chat",
        lastSequence: 3,
        messages: [
          {
            id: "user-message-1",
            role: "user" as const,
            text: "Check the workspace",
            sequence: 3,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "running" as const,
          userMessageId: "user-message-1",
          assistantMessageId: "assistant-message-1",
          assistantMessageIds: ["assistant-message-1"],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          draftMessages: [
            {
              id: "assistant-message-1",
              text: "",
              parts: [
                {
                  id: "assistant-message-1:tool-call:call-1",
                  type: "tool-call" as const,
                  order: 1,
                  toolCallId: "call-1",
                  toolName: "workspace.getStatus",
                  status: "running" as const,
                  progress: "Reading workspace status",
                  safety: "read" as const,
                  approvalStatus: "approved" as const,
                },
              ],
            },
          ],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    });

    render(<SavedConversationThread store={store} />);

    expect(
      await screen.findByText("Reading workspace status"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Assistant is responding."),
    ).not.toBeInTheDocument();
  });

  it("renders Host queued follow-ups and cancels eligible items through the store", async () => {
    const cancelled: string[] = [];
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load: async () => ({
        title: "margaux",
        lastSequence: 4,
        messages: [],
        followUps: [
          {
            id: "follow-up-1",
            commandId: "command-1",
            sessionId: "project-session-1",
            prompt: "Queued host instruction",
            state: "queued" as const,
            position: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "follow-up-2",
            commandId: "command-2",
            sessionId: "project-session-1",
            prompt: "Already consumed instruction",
            state: "consumed" as const,
            position: 2,
            dispatchedTurnId: "turn-2",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
      cancelFollowUp: async ({ followUpId }) => {
        cancelled.push(followUpId);
        return {
          followUp: {
            id: followUpId,
            commandId: "command-1",
            sessionId: "project-session-1",
            prompt: "Queued host instruction",
            state: "cancelled" as const,
            position: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      },
    });

    render(<SavedConversationThread store={store} />);

    expect(await screen.findByText("Queued follow-ups")).toBeInTheDocument();
    expect(screen.getByText("Queued host instruction")).toBeInTheDocument();
    expect(
      screen.getByText("Already consumed instruction"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Cancel follow-up" }),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel follow-up" }));

    await waitFor(() => expect(cancelled).toEqual(["follow-up-1"]));
    expect(await screen.findByText(/Cancelled/u)).toBeInTheDocument();
  });

  it("uses the composer to enqueue during a running Project Session without rendering a transcript message", async () => {
    const enqueued: string[] = [];
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load: async () => ({
        title: "margaux",
        lastSequence: 4,
        messages: [
          {
            id: "running-user-message",
            role: "user" as const,
            text: "Current work",
            sequence: 3,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "running" as const,
          userMessageId: "running-user-message",
          assistantMessageId: "running-assistant-message",
          assistantMessageIds: ["running-assistant-message"],
          draftMessages: [],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "Partial answer",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
      enqueueFollowUp: async ({ prompt, commandId }) => {
        enqueued.push(prompt);
        return {
          followUp: {
            id: "follow-up-1",
            commandId,
            sessionId: "project-session-1",
            prompt,
            state: "queued" as const,
            position: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      },
      interruptTurn: async () => ({}),
    });

    render(<SavedConversationThread store={store} />);

    expect(await screen.findByText("Thinking")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant is typing")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "Follow up while running" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(enqueued).toEqual(["Follow up while running"]));
    expect(
      await screen.findByText("Follow up while running"),
    ).toBeInTheDocument();
    expect(
      screen
        .queryAllByText("Follow up while running")
        .filter((node) => node.closest("[data-role='user']")),
    ).toHaveLength(0);
  });

  it("targets the visible turn when stopping and hides local cancel while interruption is pending", async () => {
    let releaseInterrupt!: () => void;
    const interruptReleased = new Promise<void>((resolve) => {
      releaseInterrupt = resolve;
    });
    const interrupted: { sessionId: string; turnId: string }[] = [];
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load: async () => ({
        title: "margaux",
        lastSequence: 4,
        messages: [],
        activeTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "running" as const,
          userMessageId: "running-user-message",
          assistantMessageId: "running-assistant-message",
          assistantMessageIds: ["running-assistant-message"],
          draftMessages: [],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "Partial answer",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
      interruptTurn: async ({ sessionId, turnId }) => {
        interrupted.push({ sessionId, turnId });
        await interruptReleased;
      },
    });

    render(<SavedConversationThread store={store} />);

    const stop = await screen.findByRole("button", { name: "Stop" });
    fireEvent.click(stop);

    await waitFor(() => {
      expect(interrupted).toEqual([
        {
          sessionId: "project-session-1",
          turnId: "11111111-1111-4111-8111-111111111111",
        },
      ]);
    });
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    releaseInterrupt();
  });

  it("uses the same composer queue UI for Global Chat while a turn is running", async () => {
    const enqueued: string[] = [];
    const store = createSavedConversationStore({
      kind: "global",
      sessionId: "global-session-1",
      load: async () => ({
        title: "Global prompt",
        lastSequence: 4,
        messages: [
          {
            id: "global-running-user-message",
            role: "user" as const,
            text: "Current global work",
            sequence: 3,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "running" as const,
          userMessageId: "global-running-user-message",
          assistantMessageId: "global-running-assistant-message",
          assistantMessageIds: ["global-running-assistant-message"],
          draftMessages: [],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "Partial global answer",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
      enqueueFollowUp: async ({ prompt, commandId }) => {
        enqueued.push(prompt);
        return {
          followUp: {
            id: "global-follow-up-1",
            commandId,
            sessionId: "global-session-1",
            prompt,
            state: "queued" as const,
            position: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      },
      interruptTurn: async () => ({}),
    });

    render(<SavedConversationThread store={store} />);

    const input = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "Global follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(enqueued).toEqual(["Global follow-up"]));
    expect(await screen.findByText("Global follow-up")).toBeInTheDocument();
    expect(
      screen
        .queryAllByText("Global follow-up")
        .filter((node) => node.closest("[data-role='user']")),
    ).toHaveLength(0);
  });

  it("shows honest running and recovery states without marking the turn complete", async () => {
    const running = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-running",
      load: async () => ({
        title: "margaux",
        lastSequence: 4,
        messages: [
          {
            id: "running-user-message",
            role: "user" as const,
            text: "Keep going",
            sequence: 3,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "running" as const,
          userMessageId: "running-user-message",
          assistantMessageId: "running-assistant-message",
          assistantMessageIds: ["running-assistant-message"],
          draftMessages: [],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "Partial answer",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    });
    const recovery = createSavedConversationStore({
      kind: "global",
      sessionId: "global-session-recovery",
      load: async () => ({
        title: "Needs recovery",
        lastSequence: 4,
        messages: [
          {
            id: "recovery-user-message",
            role: "user" as const,
            text: "Recover this",
            sequence: 3,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "33333333-3333-4333-8333-333333333333",
          commandId: "44444444-4444-4444-8444-444444444444",
          state: "recovery_required" as const,
          userMessageId: "recovery-user-message",
          assistantMessageId: "recovery-assistant-message",
          assistantMessageIds: ["recovery-assistant-message"],
          draftMessages: [],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "Ambiguous work",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    });
    const { rerender } = render(<SavedConversationThread store={running} />);

    expect(await screen.findByText("Thinking")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant is typing")).toBeInTheDocument();

    rerender(<SavedConversationThread store={recovery} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Conversation storage failed or requires recovery/u,
    );
  });

  it("shows a disconnected state for both Session kinds without clearing the running transcript", async () => {
    let disconnectProject: ((error: Error) => void) | undefined;
    const projectStore = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-disconnected",
      load: async () => ({
        title: "margaux",
        lastSequence: 4,
        messages: [
          {
            id: "project-running-message",
            role: "assistant" as const,
            text: "Still running",
            sequence: 4,
            createdAt: timestamp,
            turnId: "11111111-1111-4111-8111-111111111111",
          },
        ],
        activeTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "running" as const,
          userMessageId: "33333333-3333-4333-8333-333333333333",
          assistantMessageId: "project-running-message",
          assistantMessageIds: ["project-running-message"],
          draftMessages: [],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "Still running",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
      subscribeEvents: (input) => {
        disconnectProject = input.onError;
        return { cancel: () => undefined, closed: Promise.resolve() };
      },
    });
    render(<SavedConversationThread store={projectStore} />);

    expect(await screen.findByText("Still running")).toBeInTheDocument();
    disconnectProject?.(new Error("network unavailable"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection lost. Reconnecting to the Host; running work may still be active.",
    );
    expect(screen.getByText("Still running")).toBeInTheDocument();
  });

  it("surfaces empty and query failure states", async () => {
    const empty = loadedStore({
      kind: "global",
      sessionId: "global-empty",
      title: "Empty",
      messages: [],
    });
    const failing = createSavedConversationStore({
      kind: "project",
      sessionId: "project-failed",
      load: async () => {
        throw new Error("Host query failed");
      },
    });
    const { rerender } = render(<SavedConversationThread store={empty} />);

    expect(
      await screen.findByText("No saved messages yet."),
    ).toBeInTheDocument();

    rerender(<SavedConversationThread store={failing} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Host query failed",
    );
  });

  it("retries a failed turn through a Host-backed prompt resubmission and shows retrying only while the Host request is in flight", async () => {
    const submitted: string[] = [];
    let releaseRetry!: () => void;
    const retryReleased = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-retry",
      load: async () => ({
        title: "Failed turn",
        lastSequence: 4,
        messages: [
          {
            id: "failed-user-message",
            role: "user" as const,
            text: "Original prompt",
            sequence: 3,
            createdAt: timestamp,
            turnId: "11111111-1111-4111-8111-111111111111",
          },
        ],
        latestTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "failed" as const,
          userMessageId: "failed-user-message",
          assistantMessageId: "failed-assistant-message",
          assistantMessageIds: ["failed-assistant-message"],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          draftMessages: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
      submitPrompt: async ({ prompt, commandId }) => {
        submitted.push(prompt);
        await retryReleased;
        return {
          session: {
            id: "project-session-retry",
            title: "Failed turn",
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
            lastSequence: 5,
          },
          turn: {
            id: "55555555-5555-4555-8555-555555555555",
            commandId,
            state: "running" as const,
            userMessageId: "retried-user-message",
            assistantMessageId: "retried-assistant-message",
            assistantMessageIds: ["retried-assistant-message"],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "",
            draftMessages: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          userMessage: {
            id: "retried-user-message",
            role: "user" as const,
            text: prompt,
            sequence: 5,
            createdAt: timestamp,
          },
        };
      },
    });

    render(<SavedConversationThread store={store} />);

    expect(
      await screen.findByText("Assistant turn failed"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(submitted).toEqual(["Original prompt"]);
    expect(await screen.findByText("Retrying")).toBeInTheDocument();

    releaseRetry();

    await waitFor(() => expect(screen.queryByText("Retrying")).toBeNull());
  });

  it("shows ErrorState without a retry affordance when no original prompt is recoverable", async () => {
    const store = createSavedConversationStore({
      kind: "global",
      sessionId: "global-session-failed",
      load: async () => ({
        title: "Failed turn",
        lastSequence: 4,
        messages: [
          {
            id: "failed-assistant-message",
            role: "assistant" as const,
            text: "",
            sequence: 4,
            createdAt: timestamp,
            turnId: "11111111-1111-4111-8111-111111111111",
          },
        ],
        latestTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "failed" as const,
          userMessageId: "missing-user-message",
          assistantMessageId: "failed-assistant-message",
          assistantMessageIds: ["failed-assistant-message"],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          draftMessages: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    });

    render(<SavedConversationThread store={store} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Assistant turn failed");
    expect(alert).toHaveTextContent("no original prompt is available to retry");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("renders StoppedRun for an interrupted partial turn without fabricated Continue or Discard actions", async () => {
    const store = createSavedConversationStore({
      kind: "global",
      sessionId: "global-session-interrupted",
      load: async () => ({
        title: "Interrupted",
        lastSequence: 4,
        messages: [
          {
            id: "interrupted-user-message",
            role: "user" as const,
            text: "Long question",
            sequence: 3,
            createdAt: timestamp,
            turnId: "11111111-1111-4111-8111-111111111111",
          },
          {
            id: "interrupted-assistant-message",
            role: "assistant" as const,
            text: "Partial answer",
            sequence: 4,
            createdAt: timestamp,
            turnId: "11111111-1111-4111-8111-111111111111",
          },
        ],
        latestTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "interrupted" as const,
          userMessageId: "interrupted-user-message",
          assistantMessageId: "interrupted-assistant-message",
          assistantMessageIds: ["interrupted-assistant-message"],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          draftMessages: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    });

    render(<SavedConversationThread store={store} />);

    const partial = await screen.findAllByText("Partial answer");
    expect(partial).toHaveLength(1);
    expect(partial[0]!.closest('[data-slot="stopped-run"]')).not.toBeNull();
    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  });

  it("keeps an interrupted assistant message with tool activity in the transcript while showing the stopped reason", async () => {
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-interrupted-tools",
      load: async () => ({
        title: "Interrupted with tools",
        lastSequence: 4,
        messages: [
          {
            id: "interrupted-tool-user-message",
            role: "user" as const,
            text: "Inspect the workspace",
            sequence: 3,
            createdAt: timestamp,
            turnId: "11111111-1111-4111-8111-111111111111",
          },
          {
            id: "interrupted-tool-assistant-message",
            role: "assistant" as const,
            text: "Partial with tools",
            sequence: 4,
            createdAt: timestamp,
            turnId: "11111111-1111-4111-8111-111111111111",
            parts: [
              {
                id: "interrupted-tool-text",
                type: "text" as const,
                order: 1,
                text: "Partial with tools",
                turnId: "11111111-1111-4111-8111-111111111111",
              },
              {
                id: "tool-call-1",
                type: "tool-call" as const,
                order: 2,
                turnId: "11111111-1111-4111-8111-111111111111",
                toolCallId: "call-1",
                toolName: "workspace.getStatus",
                status: "running" as const,
              },
            ],
          },
        ],
        latestTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "interrupted" as const,
          userMessageId: "interrupted-tool-user-message",
          assistantMessageId: "interrupted-tool-assistant-message",
          assistantMessageIds: ["interrupted-tool-assistant-message"],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          draftMessages: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    });

    render(<SavedConversationThread store={store} />);

    expect(await screen.findByText("Partial with tools")).toBeInTheDocument();
    const stoppedRuns = document.querySelectorAll('[data-slot="stopped-run"]');
    expect(stoppedRuns).toHaveLength(1);
    expect(screen.getByText("Interrupted")).toBeInTheDocument();
  });
});
