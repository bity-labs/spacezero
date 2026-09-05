import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSavedConversationStore,
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

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading conversation",
    );
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
});
