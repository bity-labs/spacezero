import { describe, expect, it } from "vitest";
import {
  parseHostConnectedEvent,
  parseHostConnectionDescriptor,
} from "./host-connection.schema.js";

const descriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "4",
  clientCapability: "abcdefghijklmnopqrstuvwxyzabcdef0123456789ABCD",
  expiresAt: "2026-01-01T00:00:00.000Z",
  scopes: [
    "host:connection:read",
    "host:events:subscribe",
    "projects:read",
    "projects:register",
    "harness-auth:read",
    "harness-auth:write",
    "flows:read",
    "flows:write",
    "global-chat-sessions:create",
    "project-sessions:read",
    "project-sessions:create",
    "project-sessions:prompt",
  ],
};

describe("host connection schemas", () => {
  it("accepts strict loopback descriptors and typed connected events", () => {
    expect(parseHostConnectionDescriptor(descriptor)).toEqual(descriptor);
    expect(
      parseHostConnectedEvent({
        type: "host.connected",
        instanceId: descriptor.instanceId,
        protocolVersion: "4",
      }),
    ).toEqual({
      type: "host.connected",
      instanceId: descriptor.instanceId,
      protocolVersion: "4",
    });
  });
  it("accepts descriptors with a validated subset of known scopes", () => {
    const subsetDescriptor = {
      ...descriptor,
      scopes: [
        "host:connection:read",
        "host:events:subscribe",
        "projects:read",
        "projects:register",
        "project-sessions:read",
        "project-sessions:create",
        "project-sessions:prompt",
      ],
    };

    expect(parseHostConnectionDescriptor(subsetDescriptor)).toEqual(
      subsetDescriptor,
    );
  });

  it("rejects non-loopback endpoints, invalid scopes, and excess fields", () => {
    expect(() =>
      parseHostConnectionDescriptor({
        ...descriptor,
        endpoint: "http://localhost:1234/",
      }),
    ).toThrow();
    expect(() =>
      parseHostConnectionDescriptor({
        ...descriptor,
        scopes: ["host:connection:read"],
      }),
    ).toThrow();
    expect(() =>
      parseHostConnectionDescriptor({
        ...descriptor,
        scopes: ["host:connection:read", "host:connection:read"],
      }),
    ).toThrow();
    expect(() =>
      parseHostConnectionDescriptor({
        ...descriptor,
        scopes: ["host:connection:read", "unknown"],
      }),
    ).toThrow();
    expect(() =>
      parseHostConnectionDescriptor({ ...descriptor, extra: true }),
    ).toThrow();
  });
});
