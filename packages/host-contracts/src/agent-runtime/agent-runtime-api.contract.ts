import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import {
  GetAgentRuntimeDefaultsResultSchema,
  ListAgentRuntimeModelsResultSchema,
  UpdateAgentRuntimeDefaultsRequestSchema,
  UpdateAgentRuntimeDefaultsResultSchema,
} from "./agent-runtime.schema.js";
import { AgentRuntimeErrorSchemas } from "./agent-runtime-errors.schema.js";

export const AgentRuntimeAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});

const defaultsError = [
  ...HostAuthorizationErrorSchemas,
  ...AgentRuntimeErrorSchemas,
] as const;

export const AgentRuntimeApiGroup = HttpApiGroup.make("agentRuntime")
  .add(
    HttpApiEndpoint.get("listAgentRuntimeModels", "/agent-runtime/models", {
      headers: AgentRuntimeAuthorizationHeaderSchema,
      success: ListAgentRuntimeModelsResultSchema,
      error: HostAuthorizationErrorSchemas,
    }),
  )
  .add(
    HttpApiEndpoint.get("getAgentRuntimeDefaults", "/agent-runtime/defaults", {
      headers: AgentRuntimeAuthorizationHeaderSchema,
      success: GetAgentRuntimeDefaultsResultSchema,
      error: defaultsError,
    }),
  )
  .add(
    HttpApiEndpoint.put("updateAgentRuntimeDefaults", "/agent-runtime/defaults", {
      headers: AgentRuntimeAuthorizationHeaderSchema,
      payload: UpdateAgentRuntimeDefaultsRequestSchema,
      success: UpdateAgentRuntimeDefaultsResultSchema,
      error: defaultsError,
    }),
  );
