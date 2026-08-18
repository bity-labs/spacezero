import { describe, expect, it } from "vitest";
import * as hostContracts from "@spacezero/host-contracts";

describe("host-contracts public surface", () => {
  it("exports authenticated local Host tracer contracts", () => {
    expect(hostContracts.HOST_PROTOCOL_VERSION).toBe("1");
    expect(hostContracts.LOCAL_HOST_CLIENT_SCOPES).toEqual([
      "host:connection:read",
      "host:events:subscribe",
      "projects:read",
      "projects:register",
      "project-sessions:read",
      "project-sessions:create",
    ]);
    expect(hostContracts.HostApi).toBeDefined();
  });
});
