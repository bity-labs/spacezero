import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import { ListAgentRuntimeModelsResultSchema } from "./agent-runtime.schema.js";

export const AgentRuntimeAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});

export const AgentRuntimeApiGroup = HttpApiGroup.make("agentRuntime").add(
  HttpApiEndpoint.get("listAgentRuntimeModels", "/agent-runtime/models", {
    headers: AgentRuntimeAuthorizationHeaderSchema,
    success: ListAgentRuntimeModelsResultSchema,
    error: HostAuthorizationErrorSchemas,
  }),
);
