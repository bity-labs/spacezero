import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export type HarnessAuthErrorCode =
  | "invalid_provider"
  | "provider_not_supported"
  | "invalid_api_key"
  | "harness_auth_unavailable";

export interface HarnessAuthError {
  readonly code: HarnessAuthErrorCode;
  readonly message: string;
}

const harnessAuthError = <Code extends HarnessAuthErrorCode>(
  code: Code,
  status: 400 | 422 | 503,
) =>
  Schema.Struct({
    code: Schema.Literals([code]),
    message: Schema.String,
  }).pipe(HttpApiSchema.status(status));

export const InvalidProviderErrorSchema = harnessAuthError(
  "invalid_provider",
  422,
);
export const ProviderNotSupportedErrorSchema = harnessAuthError(
  "provider_not_supported",
  422,
);
export const InvalidApiKeyErrorSchema = harnessAuthError(
  "invalid_api_key",
  422,
);
export const HarnessAuthUnavailableErrorSchema = harnessAuthError(
  "harness_auth_unavailable",
  503,
);

export const HarnessAuthErrorSchemas = [
  InvalidProviderErrorSchema,
  ProviderNotSupportedErrorSchema,
  InvalidApiKeyErrorSchema,
  HarnessAuthUnavailableErrorSchema,
] as const;

export const harnessAuthErrorBody = (
  code: HarnessAuthErrorCode,
): HarnessAuthError => {
  switch (code) {
    case "invalid_provider":
      return { code, message: "Choose a valid provider." };
    case "provider_not_supported":
      return { code, message: "This provider is not supported." };
    case "invalid_api_key":
      return { code, message: "Enter a valid API key." };
    case "harness_auth_unavailable":
      return {
        code,
        message: "Harness authentication is temporarily unavailable.",
      };
  }
};
