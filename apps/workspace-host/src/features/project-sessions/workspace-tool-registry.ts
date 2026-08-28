export type WorkspaceToolSafety = "read" | "write" | "dangerous";
export type WorkspaceToolConfirmationPolicy = "never" | "ask";
export type WorkspaceToolApprovalStatus = "approved" | "requires_approval";
export type WorkspaceToolApprovalDecisionSource =
  "default_policy" | "user_setting";

export interface WorkspaceToolApprovalDecision {
  readonly status: WorkspaceToolApprovalStatus;
  readonly confirmation: WorkspaceToolConfirmationPolicy;
  readonly source: WorkspaceToolApprovalDecisionSource;
  readonly reason: "approved_by_default" | "user_confirmation_required";
}

export interface WorkspaceToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly requiresManagedWorktree: boolean;
  readonly safety: WorkspaceToolSafety;
  readonly confirmation: WorkspaceToolConfirmationPolicy;
  readonly approval: WorkspaceToolApprovalDecision;
}

export interface WorkspaceToolRegistry {
  readonly listTurnTools: () => readonly WorkspaceToolDescriptor[];
  readonly enabledToolNamesForTurn: () => readonly string[];
  readonly approvalForTool: (toolName: string) => WorkspaceToolApprovalDecision;
}

const approval = (
  confirmation: WorkspaceToolConfirmationPolicy,
): WorkspaceToolApprovalDecision =>
  confirmation === "never"
    ? {
        status: "approved",
        confirmation,
        source: "default_policy",
        reason: "approved_by_default",
      }
    : {
        status: "requires_approval",
        confirmation,
        source: "user_setting",
        reason: "user_confirmation_required",
      };

const tool = (input: {
  readonly name: string;
  readonly description: string;
  readonly safety: WorkspaceToolSafety;
  readonly confirmation?: WorkspaceToolConfirmationPolicy;
}): WorkspaceToolDescriptor => {
  const confirmation = input.confirmation ?? "never";
  return {
    name: input.name,
    description: input.description,
    requiresManagedWorktree: true,
    safety: input.safety,
    confirmation,
    approval: approval(confirmation),
  };
};

const defaultTools: readonly WorkspaceToolDescriptor[] = [
  tool({
    name: "read",
    description: "Read files inside the authenticated managed worktree.",
    safety: "read",
  }),
  tool({
    name: "write",
    description:
      "Create or overwrite files inside the authenticated managed worktree.",
    safety: "write",
  }),
  tool({
    name: "edit",
    description: "Patch files inside the authenticated managed worktree.",
    safety: "write",
  }),
];

export const createWorkspaceToolRegistry = (): WorkspaceToolRegistry => ({
  listTurnTools: () => defaultTools,
  enabledToolNamesForTurn: () =>
    defaultTools
      .filter((tool) => tool.approval.status === "approved")
      .map((tool) => tool.name),
  approvalForTool: (toolName) =>
    defaultTools.find((tool) => tool.name === toolName)?.approval ??
    approval("ask"),
});
