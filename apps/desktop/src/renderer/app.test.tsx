import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app.js";

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.location.hash = "#/";
    Object.defineProperty(window, "spacezero", {
      value: {
        getAppVersion: vi.fn(),
        getLocalHostConnection: vi.fn().mockRejectedValue(new Error("no host")),
      },
      configurable: true,
    });
  });

  it("renders the workspace shell and connects to the Local Host", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText("Window title bar")).toBeInTheDocument();
      expect(screen.getByLabelText("Workspace sidebar")).toBeInTheDocument();
      expect(
        screen.getByRole("main", { name: "Workspace" }),
      ).toBeInTheDocument();
    });
  });

  it("opens Agent Capabilities from the workspace sidebar", async () => {
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Agent Capabilities" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Agent Capabilities" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "Agent Capabilities",
    );
    expect(
      screen.getByLabelText("Agent capability configuration scope"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Skills" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Search skills")).toBeInTheDocument();
  });

  it("opens the add capability dialog and toggles row management actions", async () => {
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Agent Capabilities" }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new skill" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new subagent" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("button", { name: "Edit ai-elements" }),
    ).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));

    expect(
      screen.getByRole("button", { name: "Edit ai-elements" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete ai-elements" }),
    ).toBeInTheDocument();
  });
});
