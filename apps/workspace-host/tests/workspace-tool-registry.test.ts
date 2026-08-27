import { describe, expect, it } from "vitest";
import { createWorkspaceToolRegistry } from "../dist/features/project-sessions/workspace-tool-registry.js";

describe("Workspace Tool registry", () => {
  it("declares the initial managed-worktree tool allowlist", () => {
    const registry = createWorkspaceToolRegistry();

    expect(registry.listTurnTools()).toEqual([
      expect.objectContaining({ name: "read", requiresManagedWorktree: true }),
      expect.objectContaining({ name: "write", requiresManagedWorktree: true }),
      expect.objectContaining({ name: "edit", requiresManagedWorktree: true }),
    ]);
    expect(registry.enabledToolNamesForTurn()).toEqual([
      "read",
      "write",
      "edit",
    ]);
  });
});
