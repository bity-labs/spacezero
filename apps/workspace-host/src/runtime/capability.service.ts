import { randomBytes } from "node:crypto";
import {
  LOCAL_HOST_CLIENT_SCOPES,
  type HostConnectionDescriptor,
  type LocalHostClientScope,
} from "@spacezero/host-contracts";

export type CapabilityKind = "supervisor" | "client";
export interface CapabilityRecord {
  readonly token: string;
  readonly kind: CapabilityKind;
  readonly instanceId: string;
  readonly scopes: readonly LocalHostClientScope[];
  readonly expiresAt: number;
}
export interface CapabilityService {
  readonly issueSupervisor: () => string;
  readonly mintClient: (supervisorToken: string) => HostConnectionDescriptor;
  readonly authenticate: (token: string) => boolean;
  readonly expiresAt: (token: string) => number | undefined;
  readonly authorize: (
    token: string,
    scope: LocalHostClientScope | "supervisor",
  ) => boolean;
  readonly endpoint: string;
  readonly instanceId: string;
}

const token = (): string => randomBytes(32).toString("base64url");
export const createCapabilityService = (options: {
  readonly instanceId: string;
  readonly endpoint: string;
  readonly now?: () => number;
  readonly clientTtlMs?: number;
}): CapabilityService => {
  const now = options.now ?? Date.now;
  const clientTtlMs = options.clientTtlMs ?? 5 * 60_000;
  const records = new Map<string, CapabilityRecord>();
  let supervisorToken: string | undefined;
  const service: CapabilityService = {
    endpoint: options.endpoint,
    instanceId: options.instanceId,
    issueSupervisor: () => {
      if (supervisorToken) return supervisorToken;
      supervisorToken = token();
      records.set(supervisorToken, {
        token: supervisorToken,
        kind: "supervisor",
        instanceId: options.instanceId,
        scopes: [],
        expiresAt: Number.POSITIVE_INFINITY,
      });
      return supervisorToken;
    },
    mintClient: (candidate) => {
      if (!service.authorize(candidate, "supervisor"))
        throw new Error("unauthorized");
      const clientCapability = token();
      const expiresAtMillis = now() + clientTtlMs;
      records.set(clientCapability, {
        token: clientCapability,
        kind: "client",
        instanceId: options.instanceId,
        scopes: LOCAL_HOST_CLIENT_SCOPES,
        expiresAt: expiresAtMillis,
      });
      return {
        endpoint: options.endpoint,
        instanceId: options.instanceId,
        protocolVersion: "2",
        clientCapability,
        expiresAt: new Date(expiresAtMillis).toISOString(),
        scopes: LOCAL_HOST_CLIENT_SCOPES,
      };
    },
    authenticate: (candidate) => {
      const record = records.get(candidate);
      return Boolean(
        record &&
        record.instanceId === options.instanceId &&
        now() < record.expiresAt,
      );
    },
    expiresAt: (candidate) => records.get(candidate)?.expiresAt,
    authorize: (candidate, scope) => {
      const record = records.get(candidate);
      if (!record || !service.authenticate(candidate)) return false;
      if (scope === "supervisor") return record.kind === "supervisor";
      return record.kind === "client" && record.scopes.includes(scope);
    },
  };
  return service;
};
