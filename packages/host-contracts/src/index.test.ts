import { describe, expect, it } from "vitest";
import * as hostContracts from "@spacezero/host-contracts";

describe("host-contracts public surface", () => {
  it("exports authenticated local Host tracer contracts", () => {
    expect(hostContracts.HOST_PROTOCOL_VERSION).toBe("4");
    expect(hostContracts.LOCAL_HOST_CLIENT_SCOPES).toEqual([
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
    ]);
    expect(hostContracts.HostApi).toBeDefined();
  });
});
