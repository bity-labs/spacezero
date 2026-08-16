import { describe, expect, it } from "vitest";
import {
  createTrustedRendererPolicy,
  isValidatedLoopbackDevUrl,
} from "./navigation-policy.js";

const packagedRendererPath =
  "/Applications/Space Zero.app/Contents/Resources/app/out/renderer/index.html";

describe("trusted renderer navigation policy", () => {
  it("ignores ELECTRON_RENDERER_URL outside development", () => {
    const policy = createTrustedRendererPolicy({
      isDevelopment: false,
      rendererUrl: "http://127.0.0.1:5173/",
      packagedRendererPath,
    });

    expect(policy.source).toBe("packaged-file");
    expect(policy.initialUrl).toBe(
      "file:///Applications/Space%20Zero.app/Contents/Resources/app/out/renderer/index.html",
    );
    expect(policy.canNavigateInWindow("http://127.0.0.1:5173/")).toBe(false);
  });

  it("accepts only loopback http(s) dev renderer URLs", () => {
    expect(isValidatedLoopbackDevUrl("http://localhost:5173/")).toBe(true);
    expect(isValidatedLoopbackDevUrl("https://127.0.0.1:5173/")).toBe(true);
    expect(isValidatedLoopbackDevUrl("http://[::1]:5173/")).toBe(true);
    expect(isValidatedLoopbackDevUrl("http://example.com:5173/")).toBe(false);
    expect(isValidatedLoopbackDevUrl("file:///tmp/index.html")).toBe(false);
    expect(isValidatedLoopbackDevUrl("spacezero-test://renderer")).toBe(false);
  });

  it("blocks arbitrary http, custom-scheme, and unrelated file navigation", () => {
    const policy = createTrustedRendererPolicy({
      isDevelopment: false,
      packagedRendererPath,
    });

    expect(policy.canNavigateInWindow(policy.initialUrl)).toBe(true);
    expect(policy.canNavigateInWindow("https://example.com/")).toBe(false);
    expect(
      policy.canNavigateInWindow("spacezero-test://replace-renderer"),
    ).toBe(false);
    expect(policy.canNavigateInWindow("file:///tmp/attacker.html")).toBe(false);
  });
});
