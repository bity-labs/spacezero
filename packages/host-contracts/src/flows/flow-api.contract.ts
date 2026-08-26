import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import { FlowErrorSchemas } from "./flow-errors.schema.js";
import {
  FlowCancelResultSchema,
  FlowEventStreamQuerySchema,
  FlowPathParamsSchema,
  FlowPromptPathParamsSchema,
  FlowPromptResponseRequestSchema,
} from "./flow.schema.js";

export const FlowAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});
export const FlowEventStream = HttpApiSchema.StreamUint8Array({
  contentType: "text/event-stream",
});

export const FlowApiGroup = HttpApiGroup.make("flows")
  .add(
    HttpApiEndpoint.get("subscribeFlowEvents", "/flows/:flowId/events", {
      params: FlowPathParamsSchema,
      query: FlowEventStreamQuerySchema,
      headers: FlowAuthorizationHeaderSchema,
      success: FlowEventStream,
      error: [...HostAuthorizationErrorSchemas, ...FlowErrorSchemas],
    }),
  )
  .add(
    HttpApiEndpoint.post(
      "respondToFlowPrompt",
      "/flows/:flowId/prompts/:promptId/responses",
      {
        params: FlowPromptPathParamsSchema,
        headers: FlowAuthorizationHeaderSchema,
        payload: FlowPromptResponseRequestSchema,
        success: Schema.Struct({ ok: Schema.Boolean }),
        error: [...HostAuthorizationErrorSchemas, ...FlowErrorSchemas],
      },
    ),
  )
  .add(
    HttpApiEndpoint.post("cancelFlow", "/flows/:flowId/cancel", {
      params: FlowPathParamsSchema,
      headers: FlowAuthorizationHeaderSchema,
      success: FlowCancelResultSchema,
      error: [...HostAuthorizationErrorSchemas, ...FlowErrorSchemas],
    }),
  );
