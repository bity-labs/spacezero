import type { ZodTypeAny } from 'zod'

import type { WorkspaceToolAgentDescriptor } from '../../../shared/workspace-tool-protocol'
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
 * The tool is generic over its input schema so the handler input type is
 * inferred from the schema. Use {@link defineWorkspaceTool} when defining a
 * tool to keep handler inputs typed and validated at compile time without
 * manual casts.
 *
 * Tools are owned by features and live near their main-process application
 * services, for example `src/features/projects/main/projects.tools.ts`.
 */
export type WorkspaceTool<S extends WorkspaceToolInputSchema = ZodTypeAny> =
  WorkspaceToolMetadata & {
    inputSchema: S
    agentParameters?: WorkspaceToolAgentDescriptor['parameters']
    handler: WorkspaceToolHandler<WorkspaceToolInput<S>>
  }

/**
 * Erased Workspace Tool used by the registry and executor for heterogeneous
 * storage of tools with different input schemas.
 *
 * This is a widening of {@link WorkspaceTool}: the handler accepts `any` input
 * so a `WorkspaceTool<S>` is assignable to it regardless of its schema. Callers
 * that need schema-typed handler inputs should use {@link defineWorkspaceTool};
 * the registry and executor only need the erased form because input is parsed
 * and validated at runtime before the handler runs.
 */
export type AnyWorkspaceTool = WorkspaceToolMetadata & {
  inputSchema: WorkspaceToolInputSchema
  agentParameters?: WorkspaceToolAgentDescriptor['parameters']
  // `any` is required here so a schema-typed `WorkspaceTool<S>` is assignable
  // to this erased registry entry regardless of its input schema. The handler
  // is never called with unvalidated input: the executor parses input against
  // `inputSchema` before invoking it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: WorkspaceToolHandler<any>
}

/**
 * Define a Workspace Tool with the handler input inferred from its zod schema.
 *
 * Feature-owned `*.tools.ts` files should use this helper so handler inputs are
 * validated against the schema at compile time, without manual casts. The
 * returned tool is assignable to the erased {@link AnyWorkspaceTool} used by
 * the registry and executor.
 */
export function defineWorkspaceTool<S extends WorkspaceToolInputSchema>(
  tool: WorkspaceTool<S>
): WorkspaceTool<S> {
  return tool
}
