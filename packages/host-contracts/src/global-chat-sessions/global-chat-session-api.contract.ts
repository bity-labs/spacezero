import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import { GlobalChatSessionErrorSchemas } from "./global-chat-session-errors.schema.js";
import {
  CreateGlobalChatSessionWithFirstPromptRequestSchema,
  CreateGlobalChatSessionWithFirstPromptResultSchema,
} from "./global-chat-session.schema.js";

export const GlobalChatSessionAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});

export const GlobalChatSessionApiGroup = HttpApiGroup.make(
  "globalChatSessions",
).add(
  HttpApiEndpoint.post(
    "createGlobalChatSessionWithFirstPrompt",
    "/global-chat-sessions",
    {
      headers: GlobalChatSessionAuthorizationHeaderSchema,
      payload: CreateGlobalChatSessionWithFirstPromptRequestSchema,
      success: CreateGlobalChatSessionWithFirstPromptResultSchema,
      error: [
        ...HostAuthorizationErrorSchemas,
        ...GlobalChatSessionErrorSchemas,
      ],
    },
  ),
);
