import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CreateProjectSessionRequestSchema,
  ProjectSessionNameSchema,
  ProjectSessionSummarySchema,
} from "./project-session.schema.js";

const parseSync = Schema.decodeUnknownSync;
const uuid = "01234567-89ab-4def-8123-456789abcdef";
const commit = "a".repeat(40);

describe("Project Session schemas", () => {
  it("accepts UUID commands, permanent kebab-case names, and public summaries", () => {
    expect(
      parseSync(CreateProjectSessionRequestSchema)({
        commandId: uuid,
        projectId: uuid,
      }),
    ).toEqual({ commandId: uuid, projectId: uuid });
    expect(parseSync(ProjectSessionNameSchema)("saint-emilion")).toBe(
      "saint-emilion",
    );
    expect(
      parseSync(ProjectSessionSummarySchema)({
        id: uuid,
        projectId: uuid,
        name: "saint-emilion",
        state: "ready",
        sourceBranch: "main",
        sourceDetached: false,
        sourceCommit: commit,
        uncommittedChangesExcluded: true,
        managedBranch: `spacezero/saint-emilion-${uuid}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSequence: 4,
      }),
    ).toMatchObject({ name: "saint-emilion", state: "ready" });
  });

  it("rejects accents, spaces, path-like values, and invalid commits", () => {
    expect(() =>
      parseSync(ProjectSessionNameSchema)("Saint Émilion"),
    ).toThrow();
    expect(() =>
      parseSync(ProjectSessionNameSchema)("saint/emilion"),
    ).toThrow();
    expect(() =>
      parseSync(ProjectSessionSummarySchema)({
        id: uuid,
        projectId: uuid,
        name: "margaux",
        state: "ready",
        sourceBranch: null,
        sourceDetached: true,
        sourceCommit: "z".repeat(40),
        uncommittedChangesExcluded: false,
        managedBranch: `spacezero/margaux-${uuid}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSequence: 1,
      }),
    ).toThrow();
  });
});
