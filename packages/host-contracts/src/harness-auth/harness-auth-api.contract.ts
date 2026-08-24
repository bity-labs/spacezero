import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import { HarnessAuthErrorSchemas } from "./harness-auth-errors.schema.js";
import {
  ProviderAuthStatusResultSchema,
  ProviderPathParamsSchema,
  SetProviderApiKeyRequestSchema,
} from "./harness-auth.schema.js";

export const HarnessAuthAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});

export const HarnessAuthApiGroup = HttpApiGroup.make("harnessAuth")
  .add(
    HttpApiEndpoint.get(
      "getProviderAuthStatus",
      "/harness-auth/providers/:providerId/status",
      {
        params: ProviderPathParamsSchema,
        headers: HarnessAuthAuthorizationHeaderSchema,
        success: ProviderAuthStatusResultSchema,
        error: [...HostAuthorizationErrorSchemas, ...HarnessAuthErrorSchemas],
      },
    ),
  )
  .add(
    HttpApiEndpoint.put(
      "setProviderApiKey",
      "/harness-auth/providers/:providerId/api-key",
      {
        params: ProviderPathParamsSchema,
        headers: HarnessAuthAuthorizationHeaderSchema,
        payload: SetProviderApiKeyRequestSchema,
        success: ProviderAuthStatusResultSchema,
        error: [...HostAuthorizationErrorSchemas, ...HarnessAuthErrorSchemas],
      },
    ),
  )
  .add(
    HttpApiEndpoint["delete"](
      "removeProviderApiKey",
      "/harness-auth/providers/:providerId/api-key",
      {
        params: ProviderPathParamsSchema,
        headers: HarnessAuthAuthorizationHeaderSchema,
        success: ProviderAuthStatusResultSchema,
        error: [...HostAuthorizationErrorSchemas, ...HarnessAuthErrorSchemas],
      },
    ),
  );
