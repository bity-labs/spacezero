import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  net: { fetch: vi.fn() },
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn(),
  },
}));

import { rendererCsp, resolveRendererAssetPath } from "./renderer-protocol.js";

const created: string[] = [];
afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    created.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

const fixture = (): { root: string; outside: string } => {
  const base = mkdtempSync(join(tmpdir(), "spacezero-renderer-protocol-"));
  created.push(base);
  const root = join(base, "renderer");
  const outside = join(base, "outside.html");
  mkdirSync(root);
  writeFileSync(join(root, "index.html"), "trusted");
  writeFileSync(outside, "untrusted");
  return { root, outside };
};

describe("renderer protocol policy", () => {
  it("serves only canonical regular files below the renderer root", () => {
    const { root } = fixture();
    expect(resolveRendererAssetPath(root, "spacezero://renderer/")).toBe(
      realpathSync(join(root, "index.html")),
    );
    expect(
      resolveRendererAssetPath(root, "spacezero://attacker/index.html"),
    ).toBeUndefined();
    expect(
      resolveRendererAssetPath(root, "spacezero://renderer/%"),
    ).toBeUndefined();
    expect(
      resolveRendererAssetPath(
        root,
        "spacezero://renderer/%2e%2e/outside.html",
      ),
    ).toBeUndefined();
    expect(
      resolveRendererAssetPath(root, "spacezero://renderer/%5coutside.html"),
    ).toBeUndefined();
  });

  it("rejects a symlink that escapes the renderer root", () => {
    const { root, outside } = fixture();
    symlinkSync(outside, join(root, "linked.html"));
    expect(
      resolveRendererAssetPath(root, "spacezero://renderer/linked.html"),
    ).toBeUndefined();
  });

  it("restricts renderer content and connections to trusted resources", () => {
    expect(rendererCsp("http://127.0.0.1:1234/")).toContain(
      "connect-src 'self' http://127.0.0.1:*;",
    );
    expect(rendererCsp()).toContain(
      "connect-src 'self' http://127.0.0.1:*;",
    );
    expect(rendererCsp()).toContain("object-src 'none'");
    expect(rendererCsp()).toContain("base-uri 'none'");
    expect(rendererCsp()).toContain("frame-ancestors 'none'");
  });
});
