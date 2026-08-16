import { describe, expect, it } from "vitest";
import * as hostContracts from "@spacezero/host-contracts";

describe("host-contracts public surface", () => {
  it("loads as an empty ESM entrypoint for the initialization slice", () => {
    expect(Object.keys(hostContracts)).toEqual([]);
  });
});
