import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import {
  CreateProjectSessionRequestSchema,
  CreateProjectSessionResultSchema,
  ListProjectSessionsResultSchema,
} from "./project-session.schema.js";
import { ProjectSessionErrorSchemas } from "./project-session-errors.schema.js";

export const ProjectSessionAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});

export const ProjectSessionApiGroup = HttpApiGroup.make("projectSessions")
  .add(
    HttpApiEndpoint.post("createProjectSession", "/project-sessions", {
      headers: ProjectSessionAuthorizationHeaderSchema,
      payload: CreateProjectSessionRequestSchema,
      success: CreateProjectSessionResultSchema,
      error: [...HostAuthorizationErrorSchemas, ...ProjectSessionErrorSchemas],
    }),
  )
  .add(
    HttpApiEndpoint.get("listProjectSessions", "/project-sessions", {
      headers: ProjectSessionAuthorizationHeaderSchema,
      success: ListProjectSessionsResultSchema,
      error: [...HostAuthorizationErrorSchemas, ...ProjectSessionErrorSchemas],
    }),
  );
