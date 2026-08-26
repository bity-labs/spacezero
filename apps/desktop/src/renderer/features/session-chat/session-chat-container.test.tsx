import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSessionSummary } from "@spacezero/host-contracts";
import { SessionChatContainer } from "./session-chat-container.js";

const sessionClient = vi.hoisted(() => ({
  listProjectSessions: vi.fn(),
  createProjectSession: vi.fn(),
  submitPrompt: vi.fn(),
  listSessionMessages: vi.fn(),
  interruptTurn: vi.fn(),
  subscribeProjectSessionEvents: vi.fn(() => ({
    cancel: vi.fn(),
    closed: Promise.resolve(),
  })),
}));

vi.mock("@spacezero/client-runtime", () => ({
  createProjectSessionClient: () => sessionClient,
}));

const uuid = "11111111-1111-4111-8111-111111111111";
const session: ProjectSessionSummary = {
  id: uuid,
  projectId: uuid,
  name: "margaux",
  state: "ready",
  sourceBranch: "main",
  sourceDetached: false,
  sourceCommit: "a".repeat(40),
  uncommittedChangesExcluded: true,
  managedBranch: `spacezero/margaux-${uuid}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastSequence: 4,
};
const userMessage = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "user" as const,
  text: "Build the wine list view",
  sequence: 5,
  createdAt: "2026-01-01T00:01:00.000Z",
};
const agentMessage = {
  id: "33333333-3333-4333-8333-333333333333",
  role: "assistant" as const,
  text: "Echo: Build the wine list view",
  sequence: 7,
  createdAt: "2026-01-01T00:01:01.000Z",
};

describe("SessionChatContainer", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "spacezero", {
      value: { getLocalHostConnection: vi.fn() },
      configurable: true,
    });
  });

  it("loads Session messages and warns about excluded uncommitted changes", async () => {
    sessionClient.listSessionMessages.mockResolvedValue({
      session,
      messages: [],
    });

    render(<SessionChatContainer session={session} onBack={vi.fn()} />);

    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
    expect(sessionClient.listSessionMessages).toHaveBeenCalledWith(uuid);
    expect(
      screen.getByText(/used committed HEAD and excluded uncommitted/),
    ).toBeInTheDocument();
  });

  it("submits a prompt and appends the committed message boundaries", async () => {
    sessionClient.listSessionMessages.mockResolvedValue({
      session,
      messages: [],
    });
    sessionClient.submitPrompt.mockResolvedValue({
      session: { ...session, lastSequence: 6 },
      turn: {
        id: "44444444-4444-4444-8444-444444444444",
        commandId: "55555555-5555-4555-8555-555555555555",
        state: "running",
        userMessageId: userMessage.id,
        assistantMessageId: agentMessage.id,
        draftText: "",
        createdAt: userMessage.createdAt,
        updatedAt: userMessage.createdAt,
      },
      userMessage,
    });

    render(<SessionChatContainer session={session} onBack={vi.fn()} />);
    await screen.findByText("No messages yet.");

    const input = screen.getByRole("textbox", { name: "Prompt" });
    fireEvent.change(input, {
      target: { value: "Build the wine list view" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));

    await waitFor(() =>
      expect(sessionClient.submitPrompt).toHaveBeenCalledWith(
        uuid,
        "Build the wine list view",
      ),
    );
    expect(
      await screen.findByText("Build the wine list view"),
    ).toBeInTheDocument();
    const subscriptionCalls = (
      sessionClient.subscribeProjectSessionEvents as unknown as {
        readonly mock: {
          readonly calls: readonly [
            { readonly onEvent: (event: unknown) => void },
          ][];
        };
      }
    ).mock.calls;
    const subscriptionInput = subscriptionCalls[0]![0];
    subscriptionInput.onEvent({
      sequence: agentMessage.sequence,
      eventType: "AgentMessageCompletedV1",
      event: {
        type: "AgentMessageCompletedV1",
        version: 1,
        sessionId: uuid,
        turnId: "44444444-4444-4444-8444-444444444444",
        messageId: agentMessage.id,
        text: agentMessage.text,
        timestamp: agentMessage.createdAt,
      },
    });
    expect(
      await screen.findByText("Echo: Build the wine list view"),
    ).toBeInTheDocument();
    // The first user message dismisses the dirty-checkout warning.
    expect(
      screen.queryByText(/used committed HEAD and excluded uncommitted/),
    ).not.toBeInTheDocument();
  });

  it("shows typed Host errors and safe fallback errors", async () => {
    sessionClient.listSessionMessages.mockResolvedValue({
      session,
      messages: [],
    });
    sessionClient.submitPrompt.mockRejectedValueOnce({
      code: "agent_turn_failed",
      message: "The agent turn failed. Try the prompt again.",
    });

    const { unmount } = render(
      <SessionChatContainer session={session} onBack={vi.fn()} />,
    );
    await screen.findByText("No messages yet.");
    fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    expect(
      await screen.findByText("The agent turn failed. Try the prompt again."),
    ).toBeInTheDocument();
    unmount();

    sessionClient.listSessionMessages.mockResolvedValue({
      session,
      messages: [],
    });
    sessionClient.submitPrompt.mockRejectedValueOnce(new Error("boom"));
    render(<SessionChatContainer session={session} onBack={vi.fn()} />);
    await screen.findByText("No messages yet.");
    fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    expect(
      await screen.findByText("The prompt could not be submitted. Try again."),
    ).toBeInTheDocument();
  });

  it("shows a load error when Session messages are unavailable", async () => {
    sessionClient.listSessionMessages.mockRejectedValue(new Error("boom"));

    render(<SessionChatContainer session={session} onBack={vi.fn()} />);

    expect(
      await screen.findByText("Session messages are unavailable. Try again."),
    ).toBeInTheDocument();
  });
});
