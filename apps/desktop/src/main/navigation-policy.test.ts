import { describe, expect, it } from "vitest";
import { RENDERER_INDEX_URL, RENDERER_ORIGIN } from "./renderer-protocol.js";
import {
  createTrustedRendererPolicy,
  isValidatedLoopbackDevUrl,
} from "./navigation-policy.js";

describe("trusted renderer navigation policy", () => {
  it("uses a secure standard application origin outside development", () => {
    const policy = createTrustedRendererPolicy({
      isDevelopment: false,
      rendererUrl: "http://127.0.0.1:5173/",
    });
    expect(policy.source).toBe("packaged-scheme");
    expect(policy.initialUrl).toBe(RENDERER_INDEX_URL);
    expect(policy.allowedRendererOrigin).toBe(RENDERER_ORIGIN);
    expect(policy.allowedRendererOrigin).toBe(RENDERER_ORIGIN);
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

  it("blocks arbitrary http, custom-scheme, and file navigation", () => {
    const policy = createTrustedRendererPolicy({ isDevelopment: false });
    expect(policy.canNavigateInWindow(policy.initialUrl)).toBe(true);
    expect(
      policy.canNavigateInWindow("spacezero://renderer/assets/app.js"),
    ).toBe(true);
    expect(policy.canNavigateInWindow("https://example.com/")).toBe(false);
    expect(
      policy.canNavigateInWindow("spacezero-test://replace-renderer"),
    ).toBe(false);
    expect(policy.canNavigateInWindow("file:///tmp/attacker.html")).toBe(false);
  });
});
