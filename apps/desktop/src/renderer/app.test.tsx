import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app.js";

describe("App", () => {
  it("renders the blank application shell and connects to the Local Host", async () => {
    Object.defineProperty(window, "spacezero", {
      value: {
        getAppVersion: vi.fn(),
        getLocalHostConnection: vi.fn().mockRejectedValue(new Error("no host")),
      },
      configurable: true,
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText("Window title bar")).toBeInTheDocument();
      expect(screen.getByText("Drag region")).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
    });
  });
});
