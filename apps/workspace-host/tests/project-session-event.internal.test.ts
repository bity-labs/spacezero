import { describe, expect, it } from "vitest";
import {
  parseInternalProjectSessionEvent,
  toPublicProjectSessionEvent,
} from "../dist/features/project-sessions/project-session-event.internal.js";

const sessionId = "01234567-89ab-4def-8123-456789abcdef";
const projectId = "11111111-2222-4333-8444-555555555555";
const hostId = "22222222-3333-4444-8555-666666666666";
const commit = "a".repeat(40);
const timestamp = "2026-01-01T00:00:00.000Z";

describe("internal Project Session events", () => {
  it("requires private creation facts in the internal journal shape", () => {
    expect(() =>
      parseInternalProjectSessionEvent({
        type: "ProjectSessionCreationRequestedV1",
        version: 1,
        sessionId,
        projectId,
        name: "margaux",
        sourceBranch: "main",
        sourceDetached: false,
        sourceCommit: commit,
        uncommittedChangesExcluded: false,
        managedBranch: `spacezero/margaux-${sessionId}`,
        timestamp,
      }),
    ).toThrow();
  });

  it("preserves public failure classification metadata", () => {
    const failed = parseInternalProjectSessionEvent({
      type: "AgentTurnFailedV1",
      version: 1,
      sessionId,
      turnId: projectId,
      reason: "agent_turn_failed",
      failureCategory: "provider",
      retryable: false,
      retryAfterMs: 1_000,
      timestamp,
    });
    expect(toPublicProjectSessionEvent(failed)).toEqual({
      type: "AgentTurnFailedV1",
      version: 1,
      sessionId,
      turnId: projectId,
      reason: "agent_turn_failed",
      failureCategory: "provider",
      retryable: false,
      retryAfterMs: 1_000,
      timestamp,
    });
  });

  it("maps private creation and preparation facts to exact public shapes", () => {
    const creation = parseInternalProjectSessionEvent({
      type: "ProjectSessionCreationRequestedV1",
      version: 1,
      sessionId,
      projectId,
      name: "margaux",
      hostId,
      sourceBranch: "main",
      sourceDetached: false,
      sourceCommit: commit,
      uncommittedChangesExcluded: false,
      managedBranch: `spacezero/margaux-${sessionId}`,
      worktreePath: "/tmp/SpaceZero/worktrees/project/session",
      worktreeRoot: "/tmp/SpaceZero/worktrees/project",
      timestamp,
    });
    expect(Object.keys(toPublicProjectSessionEvent(creation)).sort()).toEqual(
      [
        "type",
        "version",
        "sessionId",
        "projectId",
        "name",
        "sourceBranch",
        "sourceDetached",
        "sourceCommit",
        "uncommittedChangesExcluded",
        "managedBranch",
        "timestamp",
      ].sort(),
    );

    const prepared = parseInternalProjectSessionEvent({
      type: "SessionWorkspacePreparedV1",
      version: 1,
      sessionId,
      canonicalWorktreePath: "/tmp/worktree",
      canonicalGitDirPath: "/tmp/worktree/.git",
      canonicalGitCommonDirPath: "/tmp/repo/.git/worktrees/session",
      worktreeDeviceId: "dev-1",
      worktreeFileId: "file-1",
      gitDirDeviceId: "dev-2",
      gitDirFileId: "file-2",
      commonDirDeviceId: "dev-3",
      commonDirFileId: "file-3",
      timestamp,
    });
    expect(toPublicProjectSessionEvent(prepared)).toEqual({
      type: "SessionWorkspacePreparedV1",
      version: 1,
      sessionId,
      timestamp,
    });
  });
});
