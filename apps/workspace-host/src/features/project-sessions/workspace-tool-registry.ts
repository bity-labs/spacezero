export interface WorkspaceToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly requiresManagedWorktree: boolean;
}

export interface WorkspaceToolRegistry {
  readonly listTurnTools: () => readonly WorkspaceToolDescriptor[];
  readonly enabledToolNamesForTurn: () => readonly string[];
}

const defaultTools: readonly WorkspaceToolDescriptor[] = [
  {
    name: "read",
    description: "Read files inside the authenticated managed worktree.",
    requiresManagedWorktree: true,
  },
  {
    name: "write",
    description:
      "Create or overwrite files inside the authenticated managed worktree.",
    requiresManagedWorktree: true,
  },
  {
    name: "edit",
    description: "Patch files inside the authenticated managed worktree.",
    requiresManagedWorktree: true,
  },
];

export const createWorkspaceToolRegistry = (): WorkspaceToolRegistry => ({
  listTurnTools: () => defaultTools,
  enabledToolNamesForTurn: () => defaultTools.map((tool) => tool.name),
});
