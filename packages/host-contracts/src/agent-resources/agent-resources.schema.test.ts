import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ListGlobalChatSessionSkillsResultSchema,
  ListProjectSessionSkillsResultSchema,
  parseListGlobalChatSessionSkillsResult,
  parseListProjectSessionSkillsResult,
} from "./agent-resources.schema.js";

const descriptor = {
  name: "release-plan",
  description: "Draft a release plan.",
  scope: "spacezero_home" as const,
  digest: "a".repeat(64),
  enabled: true,
  trusted: true,
};

const sessionId = "22222222-2222-4222-8222-222222222222";

describe("agent resources schemas", () => {
  it("parses sanitized Project Session skill descriptors", () => {
    const result = parseListProjectSessionSkillsResult({
      sessionId,
      skills: [descriptor],
      diagnostics: [],
    });
    expect(result.skills[0]).toEqual(descriptor);
  });

  it("parses sanitized Global Chat Session skill descriptors", () => {
    const result = parseListGlobalChatSessionSkillsResult({
      sessionId,
      skills: [descriptor],
      diagnostics: [],
    });
    expect(result.skills[0]).toEqual(descriptor);
  });

  it("rejects non-UUID Global Chat session ids", () => {
    expect(() =>
      Schema.decodeUnknownSync(ListGlobalChatSessionSkillsResultSchema)({
        sessionId: "not-a-uuid",
        skills: [],
        diagnostics: [],
      }),
    ).toThrow();
  });

  it("rejects unknown skill scopes", () => {
    expect(() =>
      Schema.decodeUnknownSync(ListProjectSessionSkillsResultSchema)({
        sessionId,
        skills: [{ ...descriptor, scope: "unknown_scope" }],
        diagnostics: [],
      }),
    ).toThrow();
  });
});
