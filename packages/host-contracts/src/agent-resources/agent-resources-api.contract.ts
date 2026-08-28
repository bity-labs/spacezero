import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import { ProjectSessionIdSchema } from "../project-sessions/project-session.schema.js";
import { ProjectSessionErrorSchemas } from "../project-sessions/project-session-errors.schema.js";
import { ListProjectSessionSkillsResultSchema } from "./agent-resources.schema.js";

export const AgentResourcesAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});

export const AgentResourcesProjectSessionPathParamsSchema = Schema.Struct({
  sessionId: ProjectSessionIdSchema,
});

export const AgentResourcesApiGroup = HttpApiGroup.make("agentResources").add(
  HttpApiEndpoint.get(
    "listProjectSessionSkills",
    "/project-sessions/:sessionId/skills",
    {
      params: AgentResourcesProjectSessionPathParamsSchema,
      headers: AgentResourcesAuthorizationHeaderSchema,
      success: ListProjectSessionSkillsResultSchema,
      error: [...HostAuthorizationErrorSchemas, ...ProjectSessionErrorSchemas],
    },
  ),
);
