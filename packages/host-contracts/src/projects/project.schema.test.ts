import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ProjectSummarySchema,
  RegisterProjectRequestSchema,
} from "./project.schema.js";

const decodeSummary = Schema.decodeUnknownSync(ProjectSummarySchema);
const decodeRequest = Schema.decodeUnknownSync(RegisterProjectRequestSchema);

describe("Project schemas", () => {
  it("decodes valid Project summaries and registration requests", () => {
    expect(
      decodeSummary({
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "spacezero",
        canonicalPath: "/work/spacezero",
        registeredHeadCommit: "a".repeat(40),
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ displayName: "spacezero" });
    expect(
      decodeRequest({
        commandId: "22222222-2222-4222-8222-222222222222",
        path: "/work/spacezero",
      }),
    ).toMatchObject({ path: "/work/spacezero" });
  });

  it("rejects malformed IDs, HEADs, dates, display names, and paths", () => {
    expect(() =>
      decodeSummary({
        id: "not-a-uuid",
        displayName: "spacezero",
        canonicalPath: "/work/spacezero",
        registeredHeadCommit: "a".repeat(40),
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      decodeSummary({
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "",
        canonicalPath: "/work/spacezero",
        registeredHeadCommit: "not-a-commit",
        createdAt: "not-a-date",
      }),
    ).toThrow();
    expect(() =>
      decodeRequest({
        commandId: "22222222-2222-4222-8222-222222222222",
        path: "bad\0path",
      }),
    ).toThrow();
    expect(() =>
      decodeRequest({
        commandId: "22222222-2222-4222-8222-222222222222",
        path: `/${"😀".repeat(1024)}`,
      }),
    ).toThrow();
  });
});
