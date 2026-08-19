import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  engines?: Record<string, string>;
};

describe("pi adapter package policy", () => {
  it("publishes one root export for Host consumers", () => {
    expect(Object.keys(manifest.exports ?? {})).toEqual(["."]);
    expect(manifest.exports?.["."]).toMatchObject({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
  });

  it("keeps implementation source under src with a Host-facing seam", () => {
    expect(existsSync(new URL("../src/index.ts", import.meta.url))).toBe(true);
    expect(
      existsSync(new URL("../src/conversation.model.ts", import.meta.url)),
    ).toBe(true);
  });

  it("keeps the Pi SDK dependency deferred until an explicit decision", () => {
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["effect"]);
    expect(manifest.engines?.node).toBe("22.23.1");
  });
});
