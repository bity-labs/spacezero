import { describe, expect, it } from "vitest";
import * as clientRuntime from "@spacezero/client-runtime";

describe("client-runtime public surface", () => {
  it("exports the local Host connection client", () => {
    expect(clientRuntime).toHaveProperty("createLocalHostConnectionClient");
    expect(clientRuntime).toHaveProperty("createGlobalChatSessionClient");
  });
});
