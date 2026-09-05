import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import { GlobalChatSessionErrorSchemas } from "./global-chat-session-errors.schema.js";
import {
  CancelGlobalChatSessionFollowUpResultSchema,
  CreateGlobalChatSessionWithFirstPromptRequestSchema,
  CreateGlobalChatSessionWithFirstPromptResultSchema,
  EnqueueGlobalChatSessionFollowUpRequestSchema,
  EnqueueGlobalChatSessionFollowUpResultSchema,
  GetGlobalChatSessionRuntimeResultSchema,
  GlobalChatSessionEventStreamQuerySchema,
  GlobalChatSessionFollowUpIdSchema,
  GlobalChatSessionIdSchema,
  GlobalChatSessionTurnIdSchema,
  InterruptGlobalChatSessionTurnResultSchema,
  ListGlobalChatSessionFollowUpsResultSchema,
  ListGlobalChatSessionMessagesResultSchema,
  ListGlobalChatSessionsResultSchema,
  SubmitGlobalChatSessionPromptRequestSchema,
  SubmitGlobalChatSessionPromptResultSchema,
  UpdateGlobalChatSessionRuntimeRequestSchema,
  UpdateGlobalChatSessionRuntimeResultSchema,
} from "./global-chat-session.schema.js";

export const GlobalChatSessionAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});
export const GlobalChatSessionPathParamsSchema = Schema.Struct({
  sessionId: GlobalChatSessionIdSchema,
});
export const GlobalChatSessionTurnPathParamsSchema = Schema.Struct({
  sessionId: GlobalChatSessionIdSchema,
  turnId: GlobalChatSessionTurnIdSchema,
});
export const GlobalChatSessionFollowUpPathParamsSchema = Schema.Struct({
  sessionId: GlobalChatSessionIdSchema,
  followUpId: GlobalChatSessionFollowUpIdSchema,
});
export const GlobalChatSessionEventStream = HttpApiSchema.StreamUint8Array({
  contentType: "text/event-stream",
});

export const GlobalChatSessionApiGroup = HttpApiGroup.make(
  "globalChatSessions",
)
  .add(
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
  )
  .add(
    HttpApiEndpoint.get("listGlobalChatSessions", "/global-chat-sessions", {
      headers: GlobalChatSessionAuthorizationHeaderSchema,
      success: ListGlobalChatSessionsResultSchema,
      error: [...HostAuthorizationErrorSchemas, ...GlobalChatSessionErrorSchemas],
    }),
  )
  .add(
    HttpApiEndpoint.get(
      "listGlobalChatSessionFollowUps",
      "/global-chat-sessions/:sessionId/follow-ups",
      {
        params: GlobalChatSessionPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        success: ListGlobalChatSessionFollowUpsResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "enqueueGlobalChatSessionFollowUp",
      "/global-chat-sessions/:sessionId/follow-ups",
      {
        params: GlobalChatSessionPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        payload: EnqueueGlobalChatSessionFollowUpRequestSchema,
        success: EnqueueGlobalChatSessionFollowUpResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "cancelGlobalChatSessionFollowUp",
      "/global-chat-sessions/:sessionId/follow-ups/:followUpId/cancel",
      {
        params: GlobalChatSessionFollowUpPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        success: CancelGlobalChatSessionFollowUpResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "submitGlobalChatSessionPrompt",
      "/global-chat-sessions/:sessionId/prompts",
      {
        params: GlobalChatSessionPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        payload: SubmitGlobalChatSessionPromptRequestSchema,
        success: SubmitGlobalChatSessionPromptResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "listGlobalChatSessionMessages",
      "/global-chat-sessions/:sessionId/messages",
      {
        params: GlobalChatSessionPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        success: ListGlobalChatSessionMessagesResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "getGlobalChatSessionRuntime",
      "/global-chat-sessions/:sessionId/runtime",
      {
        params: GlobalChatSessionPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        success: GetGlobalChatSessionRuntimeResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.put(
      "updateGlobalChatSessionRuntime",
      "/global-chat-sessions/:sessionId/runtime",
      {
        params: GlobalChatSessionPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        payload: UpdateGlobalChatSessionRuntimeRequestSchema,
        success: UpdateGlobalChatSessionRuntimeResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "interruptGlobalChatSessionTurn",
      "/global-chat-sessions/:sessionId/turns/:turnId/interrupt",
      {
        params: GlobalChatSessionTurnPathParamsSchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        success: InterruptGlobalChatSessionTurnResultSchema,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "subscribeGlobalChatSessionEvents",
      "/global-chat-sessions/:sessionId/events",
      {
        params: GlobalChatSessionPathParamsSchema,
        query: GlobalChatSessionEventStreamQuerySchema,
        headers: GlobalChatSessionAuthorizationHeaderSchema,
        success: GlobalChatSessionEventStream,
        error: [
          ...HostAuthorizationErrorSchemas,
          ...GlobalChatSessionErrorSchemas,
        ],
      },
    ),
  );
