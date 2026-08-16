import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app.js";

describe("App", () => {
  it("renders the initialization shell and real app-version slot", async () => {
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn().mockResolvedValue("0.0.0") },
      configurable: true,
    });
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Space Zero" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Initialization slice")).toBeInTheDocument();
    expect(await screen.findByText("0.0.0")).toBeInTheDocument();
    expect(screen.queryByText("Host protocol")).not.toBeInTheDocument();
    expect(screen.queryByText("Client runtime")).not.toBeInTheDocument();
  });
});
