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

  it("includes the Pi SDK dependencies after explicit integration decision", () => {
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([
      "@earendil-works/pi-agent-core",
      "@earendil-works/pi-ai",
      "effect",
    ]);
    expect(manifest.engines?.node).toBe("22.23.1");
  });
});
