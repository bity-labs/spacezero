import type {
  WorkspaceToolSafetyLevel,
  WorkspaceToolSafetyPolicy
} from '../shared/workspace-tool.model'

/**
 * Default global Workspace Tool Safety Policy.
 *
 * Conservative by default: read tools run without confirmation, while write and
 * dangerous tools require confirmation. Builders may opt into allowing write or
 * dangerous tools without confirmation.
 */
export const DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY: WorkspaceToolSafetyPolicy = {
  allowWriteWithoutConfirmation: false,
  allowDangerousWithoutConfirmation: false
}

export type SafetyPolicyDecision = {
  allowed: boolean
  requiresConfirmation: boolean
}

/**
 * Evaluate whether a tool call may execute without confirmation under the given
 * global safety policy.
 *
 * Read tools always run. Write and dangerous tools run without confirmation only
 * when the policy explicitly allows it; otherwise they require confirmation.
 */
export function evaluateSafetyPolicy(
  safetyLevel: WorkspaceToolSafetyLevel,
  policy: WorkspaceToolSafetyPolicy
): SafetyPolicyDecision {
  if (safetyLevel === 'read') {
    return { allowed: true, requiresConfirmation: false }
  }

  const allowed =
    safetyLevel === 'write'
      ? policy.allowWriteWithoutConfirmation
      : policy.allowDangerousWithoutConfirmation

  return { allowed, requiresConfirmation: !allowed }
}
