import { describe, expect, it } from "vitest";
import * as clientRuntime from "@spacezero/client-runtime";

describe("client-runtime public surface", () => {
  it("loads as an empty ESM entrypoint for the initialization slice", () => {
    expect(Object.keys(clientRuntime)).toEqual([]);
  });
});
