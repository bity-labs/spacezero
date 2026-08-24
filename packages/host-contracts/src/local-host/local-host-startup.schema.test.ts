import { describe, expect, it } from "vitest";
import {
  parseLocalHostBootstrapFrame,
  parseLocalHostBootstrapResult,
  parseLocalHostReadyFrame,
} from "./local-host-startup.schema.js";

describe("local Host startup schemas", () => {
  it("accepts protected bootstrap, readiness, and bootstrap-result frames", () => {
    expect(
      parseLocalHostBootstrapFrame({
        bootstrapSecret: "abcdefghijklmnopqrstuvwxyzabcdef012345",
        issuedAt: "2026-01-01T00:00:00.000Z",
        allowedRendererOrigin: "spacezero://renderer",
        spaceZeroHome: "/tmp/SpaceZero",
        protocolMin: "2",
        protocolMax: "2",
      }),
    ).toMatchObject({
      allowedRendererOrigin: "spacezero://renderer",
      spaceZeroHome: "/tmp/SpaceZero",
    });
    expect(
      parseLocalHostReadyFrame({
        endpoint: "http://127.0.0.1:1234/",
        instanceId: "0123456789abcdef0123456789abcdef",
        protocolMin: "2",
        protocolMax: "2",
      }),
    ).toMatchObject({ endpoint: "http://127.0.0.1:1234/" });
    expect(
      parseLocalHostBootstrapResult({
        supervisorCapability: "abcdefghijklmnopqrstuvwxyzabcdef012345",
      }),
    ).toMatchObject({ supervisorCapability: expect.any(String) });
  });
  it("rejects Origin null and non-loopback endpoints", () => {
    expect(() =>
      parseLocalHostBootstrapFrame({
        bootstrapSecret: "abcdefghijklmnopqrstuvwxyzabcdef012345",
        issuedAt: "2026-01-01T00:00:00.000Z",
        allowedRendererOrigin: "null",
        spaceZeroHome: "/tmp/SpaceZero",
        protocolMin: "2",
        protocolMax: "2",
      }),
    ).toThrow();
    expect(() =>
      parseLocalHostReadyFrame({
        endpoint: "http://localhost:1234/",
        instanceId: "0123456789abcdef0123456789abcdef",
        protocolMin: "2",
        protocolMax: "2",
      }),
    ).toThrow();
  });
});
