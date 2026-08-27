import { Schema } from "effect";

export type HarnessAuthSource = "stored" | "missing";
export type ProviderAuthMethod = "api_key" | "oauth";
export interface ProviderAuthOption {
  readonly providerId: string;
  readonly displayName: string;
  readonly authMethods: readonly ProviderAuthMethod[];
  readonly configured: boolean;
  readonly configuredMethod?: ProviderAuthMethod;
}
export interface ListProviderAuthOptionsResult {
  readonly providers: readonly ProviderAuthOption[];
}
export interface ProviderAuthStatus {
  readonly providerId: string;
  readonly configured: boolean;
  readonly source: HarnessAuthSource;
}
export interface SetProviderApiKeyRequest {
  readonly apiKey: string;
}
export interface ProviderAuthStatusResult {
  readonly status: ProviderAuthStatus;
}
export interface StartProviderOAuthLoginResult {
  readonly flowId: string;
}

export const ProviderAuthMethodSchema = Schema.Literals(["api_key", "oauth"]);
export const ProviderIdSchema = Schema.String;
export const ProviderPathParamsSchema = Schema.Struct({
  providerId: ProviderIdSchema,
});
export const ProviderAuthStatusSchema = Schema.Struct({
  providerId: ProviderIdSchema,
  configured: Schema.Boolean,
  source: Schema.Literals(["stored", "missing"]),
});
export const ProviderAuthOptionSchema = Schema.Struct({
  providerId: ProviderIdSchema,
  displayName: Schema.String,
  authMethods: Schema.Array(ProviderAuthMethodSchema),
  configured: Schema.Boolean,
  configuredMethod: Schema.optionalKey(ProviderAuthMethodSchema),
});
export const ListProviderAuthOptionsResultSchema = Schema.Struct({
  providers: Schema.Array(ProviderAuthOptionSchema),
});
export const ProviderAuthStatusResultSchema = Schema.Struct({
  status: ProviderAuthStatusSchema,
});
export const StartProviderOAuthLoginResultSchema = Schema.Struct({
  flowId: Schema.String,
});
export const SetProviderApiKeyRequestSchema = Schema.Struct({
  apiKey: Schema.String,
});

const textByteLength = (value: string): number => {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
};

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isValidHarnessProviderId = (providerId: string): boolean =>
  providerId.length > 0 &&
  textByteLength(providerId) <= 128 &&
  /^[a-z0-9][a-z0-9._-]*$/.test(providerId);

const isAuthMethod = (value: unknown): value is ProviderAuthMethod =>
  value === "api_key" || value === "oauth";

export function parseListProviderAuthOptionsResult(
  value: unknown,
): ListProviderAuthOptionsResult {
  if (!isRecord(value) || !exactKeys(value, ["providers"]))
    throw new Error("invalid provider auth options result");
  if (!Array.isArray(value.providers))
    throw new Error("invalid provider auth options result");
  for (const provider of value.providers) {
    if (!isRecord(provider))
      throw new Error("invalid provider auth options result");
    const keys = provider.configured
      ? [
          "providerId",
          "displayName",
          "authMethods",
          "configured",
          "configuredMethod",
        ]
      : ["providerId", "displayName", "authMethods", "configured"];
    if (!exactKeys(provider, keys))
      throw new Error("invalid provider auth options result");
    if (
      typeof provider.providerId !== "string" ||
      !isValidHarnessProviderId(provider.providerId) ||
      typeof provider.displayName !== "string" ||
      provider.displayName.length === 0 ||
      !Array.isArray(provider.authMethods) ||
      provider.authMethods.length === 0 ||
      !provider.authMethods.every(isAuthMethod) ||
      new Set(provider.authMethods).size !== provider.authMethods.length ||
      typeof provider.configured !== "boolean"
    ) {
      throw new Error("invalid provider auth options result");
    }
    if (provider.configured) {
      if (
        !isAuthMethod(provider.configuredMethod) ||
        !provider.authMethods.includes(provider.configuredMethod)
      ) {
        throw new Error("invalid provider auth options result");
      }
    }
  }
  return value as unknown as ListProviderAuthOptionsResult;
}

export function parseProviderAuthStatusResult(
  value: unknown,
): ProviderAuthStatusResult {
  if (!isRecord(value) || !exactKeys(value, ["status"]))
    throw new Error("invalid provider auth status result");
  const status = value.status;
  if (
    !isRecord(status) ||
    !exactKeys(status, ["providerId", "configured", "source"])
  )
    throw new Error("invalid provider auth status result");
  if (
    typeof status.providerId !== "string" ||
    !isValidHarnessProviderId(status.providerId) ||
    typeof status.configured !== "boolean" ||
    (status.source !== "stored" && status.source !== "missing") ||
    status.configured !== (status.source === "stored")
  ) {
    throw new Error("invalid provider auth status result");
  }
  return value as unknown as ProviderAuthStatusResult;
}

export function parseStartProviderOAuthLoginResult(
  value: unknown,
): StartProviderOAuthLoginResult {
  if (!isRecord(value) || !exactKeys(value, ["flowId"]))
    throw new Error("invalid provider OAuth login result");
  if (
    typeof value.flowId !== "string" ||
    value.flowId.length === 0 ||
    textByteLength(value.flowId) > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value.flowId)
  ) {
    throw new Error("invalid provider OAuth login result");
  }
  return value as unknown as StartProviderOAuthLoginResult;
}

export function parseSetProviderApiKeyRequest(
  value: unknown,
): SetProviderApiKeyRequest {
  if (!isRecord(value) || !exactKeys(value, ["apiKey"]))
    throw new Error("invalid provider API key request");
  if (
    typeof value.apiKey !== "string" ||
    value.apiKey.length === 0 ||
    textByteLength(value.apiKey) > 16 * 1024
  ) {
    throw new Error("invalid provider API key request");
  }
  return value as unknown as SetProviderApiKeyRequest;
}
