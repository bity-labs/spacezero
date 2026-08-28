import { describe, expect, it } from "vitest";
import { createCapabilityService } from "./capability.service.js";

const endpoint = "http://127.0.0.1:1234/";
const instanceId = "0123456789abcdef0123456789abcdef";

describe("capability service", () => {
  it("keeps supervisor and client authority separate", () => {
    const service = createCapabilityService({ endpoint, instanceId });
    const supervisor = service.issueSupervisor();
    const client = service.mintClient(supervisor);

    expect(service.authorize(supervisor, "supervisor")).toBe(true);
    expect(service.authorize(supervisor, "host:connection:read")).toBe(false);
    expect(service.authorize(client.clientCapability, "supervisor")).toBe(
      false,
    );
    expect(() => service.mintClient(client.clientCapability)).toThrow(
      "unauthorized",
    );
    expect(client.scopes).toEqual([
      "host:connection:read",
      "host:events:subscribe",
      "projects:read",
      "projects:register",
      "harness-auth:read",
      "harness-auth:write",
      "agent-runtime:read",
      "agent-resources:read",
      "flows:read",
      "flows:write",
      "project-sessions:read",
      "project-sessions:create",
      "project-sessions:prompt",
    ]);
  });

  it("expires client authority at the deadline", () => {
    let now = 1_000;
    const service = createCapabilityService({
      endpoint,
      instanceId,
      now: () => now,
      clientTtlMs: 100,
    });
    const client = service.mintClient(service.issueSupervisor());
    expect(
      service.authorize(client.clientCapability, "host:connection:read"),
    ).toBe(true);
    now = 1_100;
    expect(
      service.authorize(client.clientCapability, "host:connection:read"),
    ).toBe(false);
  });

  it("rejects capabilities issued by another Host instance", () => {
    const hostA = createCapabilityService({ endpoint, instanceId });
    const hostB = createCapabilityService({
      endpoint: "http://127.0.0.1:5678/",
      instanceId: "fedcba9876543210fedcba9876543210",
    });
    const clientA = hostA.mintClient(hostA.issueSupervisor());

    expect(
      hostB.authorize(clientA.clientCapability, "host:connection:read"),
    ).toBe(false);
  });
});
