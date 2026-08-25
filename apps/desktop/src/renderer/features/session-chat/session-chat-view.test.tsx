import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionMessage } from "@spacezero/host-contracts";
import {
  SessionChatView,
  type SessionChatViewProps,
} from "./session-chat-view.js";

const message = (
  overrides: Partial<SessionMessage> & { readonly id: string },
): SessionMessage => ({
  role: "user",
  text: "hello",
  sequence: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const renderView = (overrides: Partial<SessionChatViewProps> = {}) => {
  const props: SessionChatViewProps = {
    sessionName: "margaux",
    status: "ready",
    messages: [],
    showSourceWarning: false,
    sourceDescription: "main @ aaaaaaaa",
    busy: false,
    promptError: null,
    onSubmitPrompt: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<SessionChatView {...props} />) };
};

describe("SessionChatView", () => {
  afterEach(() => cleanup());

  it("renders the Session name and an empty chat placeholder", () => {
    renderView();
    expect(
      screen.getByRole("heading", { name: "margaux" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No messages yet.")).toBeInTheDocument();
  });

  it("renders message boundaries in journal order", () => {
    renderView({
      messages: [
        message({ id: "1", role: "user", text: "Build the wine list view" }),
        message({
          id: "2",
          role: "assistant",
          text: "Echo: Build the wine list view",
          sequence: 3,
        }),
      ],
    });
    const messages = screen.getAllByTestId("session-chat-message");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveTextContent("Build the wine list view");
    expect(messages[1]).toHaveTextContent("Echo: Build the wine list view");
  });

  it("submits the typed prompt and clears the input", () => {
    const { props } = renderView();
    const input = screen.getByRole("textbox", { name: "Prompt" });
    fireEvent.change(input, { target: { value: "Build the wine list view" } });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    expect(props.onSubmitPrompt).toHaveBeenCalledWith(
      "Build the wine list view",
    );
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  it("does not submit blank prompts", () => {
    const { props } = renderView();
    const input = screen.getByRole("textbox", { name: "Prompt" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    expect(props.onSubmitPrompt).not.toHaveBeenCalled();
  });

  it("disables the prompt form while a turn is in flight", () => {
    renderView({ busy: true });
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBeDisabled();
  });

  it("shows the dirty-checkout warning until the first user message exists", () => {
    const { unmount } = renderView({ showSourceWarning: true });
    expect(
      screen.getByText(/used committed HEAD and excluded uncommitted/),
    ).toBeInTheDocument();
    expect(screen.getByText("main @ aaaaaaaa")).toBeInTheDocument();
    unmount();

    renderView({ showSourceWarning: false });
    expect(
      screen.queryByText(/used committed HEAD and excluded uncommitted/),
    ).not.toBeInTheDocument();
  });

  it("surfaces prompt errors and returns to the Project list", () => {
    const { props } = renderView({
      promptError: "The agent turn failed. Try the prompt again.",
    });
    expect(
      screen.getByRole("alert", { name: "Prompt error" }),
    ).toHaveTextContent("The agent turn failed. Try the prompt again.");
    fireEvent.click(screen.getByRole("button", { name: "Back to Projects" }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("shows loading and load-error states", () => {
    const { unmount } = renderView({ status: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Session messages…",
    );
    unmount();
    renderView({
      status: "error",
      loadError: "Session messages are unavailable. Try again.",
    });
    expect(
      screen.getByText("Session messages are unavailable. Try again."),
    ).toBeInTheDocument();
  });
});
