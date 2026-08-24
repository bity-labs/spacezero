import { Schema } from "effect";

export type HarnessAuthSource = "stored" | "missing";
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

export const ProviderIdSchema = Schema.String;
export const ProviderPathParamsSchema = Schema.Struct({
  providerId: ProviderIdSchema,
});
export const ProviderAuthStatusSchema = Schema.Struct({
  providerId: ProviderIdSchema,
  configured: Schema.Boolean,
  source: Schema.Literals(["stored", "missing"]),
});
export const ProviderAuthStatusResultSchema = Schema.Struct({
  status: ProviderAuthStatusSchema,
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
