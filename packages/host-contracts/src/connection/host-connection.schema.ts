import { Schema } from "effect";

export const HOST_PROTOCOL_VERSION = "4" as const;
export const LOCAL_HOST_CLIENT_SCOPES = [
  "host:connection:read",
  "host:events:subscribe",
  "projects:read",
  "projects:register",
  "harness-auth:read",
  "harness-auth:write",
  "agent-runtime:read",
  "agent-runtime:write",
  "agent-resources:read",
  "flows:read",
  "flows:write",
  "global-chat-sessions:create",
  "global-chat-sessions:read",
  "global-chat-sessions:prompt",
  "project-sessions:read",
  "project-sessions:create",
  "project-sessions:prompt",
] as const;
export type LocalHostClientScope = (typeof LOCAL_HOST_CLIENT_SCOPES)[number];
export type HostConnectionStatus = "ready";

export interface HostConnectionDescriptor {
  readonly endpoint: string;
  readonly instanceId: string;
  readonly protocolVersion: typeof HOST_PROTOCOL_VERSION;
  readonly clientCapability: string;
  readonly expiresAt: string;
  readonly scopes: readonly LocalHostClientScope[];
}
export interface HostConnectionSnapshot {
  readonly instanceId: string;
  readonly protocolVersion: typeof HOST_PROTOCOL_VERSION;
  readonly status: HostConnectionStatus;
}
export interface HostConnectedEvent {
  readonly type: "host.connected";
  readonly instanceId: string;
  readonly protocolVersion: typeof HOST_PROTOCOL_VERSION;
}
export interface HostSseEvent {
  readonly id: string;
  readonly event: "host.connected";
  readonly data: HostConnectedEvent;
}

export const HostConnectionSnapshotSchema = Schema.Struct({
  instanceId: Schema.String,
  protocolVersion: Schema.Literals([HOST_PROTOCOL_VERSION]),
  status: Schema.Literals(["ready"]),
});
export const HostConnectedEventSchema = Schema.Struct({
  type: Schema.Literals(["host.connected"]),
  instanceId: Schema.String,
  protocolVersion: Schema.Literals([HOST_PROTOCOL_VERSION]),
});
export const HostSseEventSchema = Schema.Struct({
  id: Schema.String,
  event: Schema.Literals(["host.connected"]),
  data: HostConnectedEventSchema,
});
export const HostConnectionDescriptorSchema = Schema.Struct({
  endpoint: Schema.String,
  instanceId: Schema.String,
  protocolVersion: Schema.Literals([HOST_PROTOCOL_VERSION]),
  clientCapability: Schema.String,
  expiresAt: Schema.String,
  scopes: Schema.Array(Schema.Literals([...LOCAL_HOST_CLIENT_SCOPES])),
});

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isValidIsoInstant = (value: string): boolean => {
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
};
export const isValidInstanceId = (value: string): boolean =>
  /^[0-9a-f]{32}$/.test(value);
export const isLoopbackHttpEndpoint = (value: string): boolean => {
  return /^http:\/\/127\.0\.0\.1:\d+\/$/.test(value);
};
export const isValidClientScopes = (
  value: readonly unknown[],
): value is readonly LocalHostClientScope[] => {
  const known = new Set<string>(LOCAL_HOST_CLIENT_SCOPES);
  const seen = new Set<unknown>();
  return (
    value.includes("host:connection:read") &&
    value.includes("host:events:subscribe") &&
    value.every((scope) => {
      if (seen.has(scope) || typeof scope !== "string" || !known.has(scope))
        return false;
      seen.add(scope);
      return true;
    })
  );
};

export function parseHostConnectionDescriptor(
  value: unknown,
): HostConnectionDescriptor {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "endpoint",
      "instanceId",
      "protocolVersion",
      "clientCapability",
      "expiresAt",
      "scopes",
    ])
  ) {
    throw new Error("invalid host connection descriptor");
  }
  if (
    typeof value.endpoint !== "string" ||
    !isLoopbackHttpEndpoint(value.endpoint) ||
    typeof value.instanceId !== "string" ||
    !isValidInstanceId(value.instanceId) ||
    value.protocolVersion !== HOST_PROTOCOL_VERSION ||
    typeof value.clientCapability !== "string" ||
    value.clientCapability.length < 32 ||
    typeof value.expiresAt !== "string" ||
    !isValidIsoInstant(value.expiresAt) ||
    !Array.isArray(value.scopes) ||
    !isValidClientScopes(value.scopes)
  ) {
    throw new Error("invalid host connection descriptor");
  }
  return value as unknown as HostConnectionDescriptor;
}
export function parseHostConnectionSnapshot(
  value: unknown,
): HostConnectionSnapshot {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["instanceId", "protocolVersion", "status"])
  )
    throw new Error("invalid host connection snapshot");
  if (
    typeof value.instanceId !== "string" ||
    !isValidInstanceId(value.instanceId) ||
    value.protocolVersion !== HOST_PROTOCOL_VERSION ||
    value.status !== "ready"
  )
    throw new Error("invalid host connection snapshot");
  return value as unknown as HostConnectionSnapshot;
}
export function parseHostConnectedEvent(value: unknown): HostConnectedEvent {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["type", "instanceId", "protocolVersion"])
  )
    throw new Error("invalid host connected event");
  if (
    value.type !== "host.connected" ||
    typeof value.instanceId !== "string" ||
    !isValidInstanceId(value.instanceId) ||
    value.protocolVersion !== HOST_PROTOCOL_VERSION
  )
    throw new Error("invalid host connected event");
  return value as unknown as HostConnectedEvent;
}
