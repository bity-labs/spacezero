import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import {
  CreateProjectSessionRequestSchema,
  CreateProjectSessionResultSchema,
  ListProjectSessionsResultSchema,
  ListSessionMessagesResultSchema,
  ProjectSessionEventStreamQuerySchema,
  ProjectSessionIdSchema,
  SubmitSessionPromptRequestSchema,
  SubmitSessionPromptResultSchema,
} from "./project-session.schema.js";
import { ProjectSessionErrorSchemas } from "./project-session-errors.schema.js";

export const ProjectSessionAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});
export const ProjectSessionPathParamsSchema = Schema.Struct({
  sessionId: ProjectSessionIdSchema,
});
export const ProjectSessionEventStream = HttpApiSchema.StreamUint8Array({
  contentType: "text/event-stream",
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
  )
  .add(
    HttpApiEndpoint.post(
      "submitSessionPrompt",
      "/project-sessions/:sessionId/prompts",
      {
        params: ProjectSessionPathParamsSchema,
        headers: ProjectSessionAuthorizationHeaderSchema,
        payload: SubmitSessionPromptRequestSchema,
        success: SubmitSessionPromptResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...ProjectSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "listSessionMessages",
      "/project-sessions/:sessionId/messages",
      {
        params: ProjectSessionPathParamsSchema,
        headers: ProjectSessionAuthorizationHeaderSchema,
        success: ListSessionMessagesResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...ProjectSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "subscribeProjectSessionEvents",
      "/project-sessions/:sessionId/events",
      {
        params: ProjectSessionPathParamsSchema,
        query: ProjectSessionEventStreamQuerySchema,
        headers: ProjectSessionAuthorizationHeaderSchema,
        success: ProjectSessionEventStream,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...ProjectSessionErrorSchemas,
        ],
      },
    ),
  );
