import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPublicToolContentPolicy } from "./tool-content-policy.js";

describe("public tool content policy", () => {
  it("normalizes worktree paths, preserves ordinary external paths, omits protected paths, and redacts secrets", () => {
    const worktree = "/home/builder/SpaceZero/worktrees/project/session";
    const policy = createPublicToolContentPolicy({
      worktreeRoot: worktree,
      protectedPathRoots: ["/home/builder/.spacezero/pi-transcripts"],
      protectedSecretValues: ["sk-live-secret"],
    });

    expect(
      policy.sanitizeJsonObject({
        path: join(worktree, "src/app.ts"),
        configPath: "/home/builder/.config/some-tool/config.json",
        transcriptPath: "/home/builder/.spacezero/pi-transcripts/turn.json",
        apiKey: "sk-live-secret",
        note: `read ${join(worktree, "src/app.ts")} with sk-live-secret`,
      }),
    ).toEqual({
      path: "src/app.ts",
      configPath: "/home/builder/.config/some-tool/config.json",
      transcriptPath: "[omitted protected path]",
      apiKey: "[redacted]",
      note: "read src/app.ts with [redacted]",
    });
  });

  it("retains an upstream truncation marker without exposing a temporary full-output path", () => {
    const policy = createPublicToolContentPolicy({
      protectedPathRoots: ["/private/pi/transcripts"],
    });

    expect(
      policy.sanitizeResult({
        content: [
          {
            type: "text",
            text: "Ran `bash`\nstdout\n[Output truncated. Full output: /tmp/pi-output/full.txt]",
          },
        ],
        details: { truncated: true, fullOutputPath: "/tmp/pi-output/full.txt" },
      }),
    ).toEqual({
      content: [
        {
          type: "text",
          text: "Ran `bash`\nstdout\n[Output truncated. Full output: [omitted protected path]]",
        },
      ],
      truncated: true,
    });
  });

  it("retains safe image results and replaces unsupported or malformed display content with an explicit fallback", () => {
    const policy = createPublicToolContentPolicy({
      protectedSecretValues: ["private-secret"],
    });

    expect(
      policy.sanitizeResult({
        content: [
          { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
          {
            type: "image",
            mimeType: "image/svg+xml",
            data: "PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
          },
          { type: "image", mimeType: "image/jpeg", data: "javascript:bad" },
          {
            type: "html",
            html: "<img src=x onerror=alert('not executable')>",
          },
          { type: "text", text: "visible private-secret" },
        ],
      }),
    ).toEqual({
      content: [
        { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
        {
          type: "unsupported",
          label: "Unsupported image result (image/svg+xml).",
        },
        {
          type: "unsupported",
          label: "Malformed image result (image/jpeg).",
        },
        {
          type: "unsupported",
          label: "Unsupported tool result content type: html.",
        },
        { type: "text", text: "visible [redacted]" },
      ],
    });
  });

  it("redacts protected secret values from image result data with an explicit fallback", () => {
    const policy = createPublicToolContentPolicy({
      protectedSecretValues: ["abcd1234"],
    });

    const result = policy.sanitizeResult({
      content: [{ type: "image", mimeType: "image/png", data: "abcd1234" }],
    });

    expect(result).toEqual({
      content: [
        {
          type: "unsupported",
          label: "Redacted image result (image/png).",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("abcd1234");
  });
});
