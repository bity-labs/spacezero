import type { ZodTypeAny } from 'zod'

import type { WorkspaceToolMetadata, WorkspaceToolResult } from '../shared/workspace-tool.model'

/** A zod schema used to validate Workspace Tool input before execution. */
export type WorkspaceToolInputSchema = ZodTypeAny

/** Input type inferred from a tool's {@link WorkspaceToolInputSchema}. */
export type WorkspaceToolInput<S extends WorkspaceToolInputSchema> = S['_output']

/**
 * Handler invoked after input validation and safety policy evaluation pass.
 *
 * Handlers return structured data only through {@link WorkspaceToolResult}.
 * They must not throw polished conversational summaries; runtime errors are
 * captured by the executor and recorded as structured results.
 */
export type WorkspaceToolHandler<I = unknown> = (
  input: I
) => WorkspaceToolResult | Promise<WorkspaceToolResult>

/**
 * An executable Workspace Tool: metadata describing the capability plus the
 * zod schema and handler that implement it.
 *
 * Tools are owned by features and live near their main-process application
 * services, for example `src/features/projects/main/projects.tools.ts`.
 */
export type WorkspaceTool = WorkspaceToolMetadata & {
  inputSchema: WorkspaceToolInputSchema
  handler: WorkspaceToolHandler
}
