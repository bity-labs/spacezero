import { Schema } from "effect";
import {
  HOST_PROTOCOL_VERSION,
  isLoopbackHttpEndpoint,
  isValidInstanceId,
  isValidIsoInstant,
} from "../connection/host-connection.schema.js";

export interface LocalHostBootstrapFrame {
  readonly bootstrapSecret: string;
  readonly issuedAt: string;
  readonly allowedRendererOrigin: string;
  readonly spaceZeroHome: string;
  readonly protocolMin: typeof HOST_PROTOCOL_VERSION;
  readonly protocolMax: typeof HOST_PROTOCOL_VERSION;
}
export interface LocalHostReadyFrame {
  readonly endpoint: string;
  readonly instanceId: string;
  readonly protocolMin: typeof HOST_PROTOCOL_VERSION;
  readonly protocolMax: typeof HOST_PROTOCOL_VERSION;
}
export interface LocalHostBootstrapResult {
  readonly supervisorCapability: string;
}
export const LocalHostBootstrapFrameSchema = Schema.Struct({
  bootstrapSecret: Schema.String,
  issuedAt: Schema.String,
  allowedRendererOrigin: Schema.String,
  spaceZeroHome: Schema.String,
  protocolMin: Schema.Literals([HOST_PROTOCOL_VERSION]),
  protocolMax: Schema.Literals([HOST_PROTOCOL_VERSION]),
});
export const LocalHostReadyFrameSchema = Schema.Struct({
  endpoint: Schema.String,
  instanceId: Schema.String,
  protocolMin: Schema.Literals([HOST_PROTOCOL_VERSION]),
  protocolMax: Schema.Literals([HOST_PROTOCOL_VERSION]),
});
export const LocalHostBootstrapResultSchema = Schema.Struct({
  supervisorCapability: Schema.String,
});
const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
};

export const isAllowedRendererOrigin = (value: string): boolean => {
  if (value === "null") return false;
  if (value === "spacezero://renderer") return true;
  return /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(value);
};
export function parseLocalHostBootstrapFrame(
  value: unknown,
): LocalHostBootstrapFrame {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "bootstrapSecret",
      "issuedAt",
      "allowedRendererOrigin",
      "spaceZeroHome",
      "protocolMin",
      "protocolMax",
    ])
  )
    throw new Error("invalid bootstrap frame");
  if (
    typeof value.bootstrapSecret !== "string" ||
    value.bootstrapSecret.length < 32 ||
    typeof value.issuedAt !== "string" ||
    !isValidIsoInstant(value.issuedAt) ||
    typeof value.allowedRendererOrigin !== "string" ||
    !isAllowedRendererOrigin(value.allowedRendererOrigin) ||
    typeof value.spaceZeroHome !== "string" ||
    value.spaceZeroHome.length === 0 ||
    value.spaceZeroHome.includes("\0") ||
    utf8ByteLength(value.spaceZeroHome) > 4096 ||
    value.protocolMin !== HOST_PROTOCOL_VERSION ||
    value.protocolMax !== HOST_PROTOCOL_VERSION
  )
    throw new Error("invalid bootstrap frame");
  return value as unknown as LocalHostBootstrapFrame;
}
export function parseLocalHostReadyFrame(value: unknown): LocalHostReadyFrame {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["endpoint", "instanceId", "protocolMin", "protocolMax"])
  )
    throw new Error("invalid ready frame");
  if (
    typeof value.endpoint !== "string" ||
    !isLoopbackHttpEndpoint(value.endpoint) ||
    typeof value.instanceId !== "string" ||
    !isValidInstanceId(value.instanceId) ||
    value.protocolMin !== HOST_PROTOCOL_VERSION ||
    value.protocolMax !== HOST_PROTOCOL_VERSION
  )
    throw new Error("invalid ready frame");
  return value as unknown as LocalHostReadyFrame;
}
export function parseLocalHostBootstrapResult(
  value: unknown,
): LocalHostBootstrapResult {
  if (!isRecord(value) || !exactKeys(value, ["supervisorCapability"]))
    throw new Error("invalid bootstrap result");
  if (
    typeof value.supervisorCapability !== "string" ||
    value.supervisorCapability.length < 32
  )
    throw new Error("invalid bootstrap result");
  return value as unknown as LocalHostBootstrapResult;
}
