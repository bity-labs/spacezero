import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-session-recovery-"));
  temps.push(dir);
  return dir;
};
const promptFingerprint = (input: {
  readonly sessionId: string;
  readonly prompt: string;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({ sessionId: input.sessionId, prompt: input.prompt }),
    )
    .digest("hex");
const clientHeaders = (host: StartedHostServer) => {
  const client = host.capabilities.mintClient(
    host.capabilities.issueSupervisor(),
  );
  return {
    Authorization: `Bearer ${client.clientCapability}`,
    Origin: origin,
    "Content-Type": "application/json",
  };
};

describe("Project Session startup recovery", () => {
  it("marks incomplete provisioning rows recovery_required before listening", async () => {
    const root = await temp();
    const dbPath = join(root, "host.sqlite");
    const host = await startHostServer({
      allowedRendererOrigin: origin,
      bootstrap: { consume: () => undefined },
      databasePath: dbPath,
      spaceZeroHome: join(root, "SpaceZero"),
    });
    hosts.push(host);
    await host.stop();
    hosts = [];

    const db = new DatabaseSync(dbPath);
    const now = new Date().toISOString();
    const projectId = randomUUID();
    const sessionId = randomUUID();
    await mkdir(join(root, "repo"));
    await writeFile(join(root, "repo", "README.md"), "x\n");
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare(
      "INSERT INTO projects (project_id, display_name, canonical_root_path, canonical_git_dir_path, canonical_git_common_dir_path, root_device_id, root_file_id, common_dir_device_id, common_dir_file_id, registered_head_commit, created_at) VALUES (?, 'repo', ?, ?, ?, '1', '2', '3', '4', ?, ?)",
    ).run(
      projectId,
      join(root, "repo"),
      join(root, "repo", ".git"),
      join(root, "repo", ".git"),
      "a".repeat(40),
      now,
    );
    db.prepare(
      "INSERT INTO project_sessions (session_id, project_id, name, host_id, state, source_branch, source_detached, source_commit, uncommitted_changes_excluded, managed_branch, intended_worktree_path, intended_worktree_root, created_at, updated_at, last_sequence) VALUES (?, ?, 'margaux', (SELECT host_id FROM host_metadata WHERE singleton = 1), 'provisioning', 'main', 0, ?, 0, ?, ?, ?, ?, ?, 2)",
    ).run(
      sessionId,
      projectId,
      "a".repeat(40),
      `spacezero/margaux-${sessionId}`,
      join(root, "SpaceZero", "worktrees", projectId, sessionId),
      join(root, "SpaceZero", "worktrees", projectId),
      now,
      now,
    );
    db.prepare(
      "INSERT INTO project_session_name_reservations (name, base_name, session_id, allocated_at) VALUES ('margaux', 'margaux', ?, ?)",
    ).run(sessionId, now);
    db.prepare(
      "INSERT INTO project_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (?, 'fp', ?, 'pending', 2, ?, ?)",
    ).run(randomUUID(), sessionId, now, now);
    db.close();

    const restarted = await startHostServer({
      allowedRendererOrigin: origin,
      bootstrap: { consume: () => undefined },
      databasePath: dbPath,
      spaceZeroHome: join(root, "SpaceZero"),
    });
    hosts.push(restarted);
    const client = restarted.capabilities.mintClient(
      restarted.capabilities.issueSupervisor(),
    );
    const response = await fetch(
      new URL("/v1/project-sessions", restarted.endpoint),
      {
        headers: {
          Authorization: `Bearer ${client.clientCapability}`,
          Origin: origin,
        },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessions: [{ id: sessionId, state: "recovery_required" }],
    });
  });

  it("marks pending prompt turns recovery_required without synthesizing completion", async () => {
    const root = await temp();
    const dbPath = join(root, "host.sqlite");
    const host = await startHostServer({
      allowedRendererOrigin: origin,
      bootstrap: { consume: () => undefined },
      databasePath: dbPath,
      spaceZeroHome: join(root, "SpaceZero"),
    });
    hosts.push(host);
    await host.stop();
    hosts = [];

    const db = new DatabaseSync(dbPath);
    const now = new Date().toISOString();
    const projectId = randomUUID();
    const sessionId = randomUUID();
    const commandId = randomUUID();
    const userMessageId = randomUUID();
    const turnId = randomUUID();
    const prompt = "continue the interrupted turn";
    const completedCommandId = randomUUID();
    const completedUserMessageId = randomUUID();
    const completedAgentMessageId = randomUUID();
    const completedTurnId = randomUUID();
    const completedPrompt = "completed before crash";
    const completedAnswer = "Already done";
    await mkdir(join(root, "repo-pending"));
    await writeFile(join(root, "repo-pending", "README.md"), "x\n");
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare(
      "INSERT INTO projects (project_id, display_name, canonical_root_path, canonical_git_dir_path, canonical_git_common_dir_path, root_device_id, root_file_id, common_dir_device_id, common_dir_file_id, registered_head_commit, created_at) VALUES (?, 'repo-pending', ?, ?, ?, '1', '2', '3', '4', ?, ?)",
    ).run(
      projectId,
      join(root, "repo-pending"),
      join(root, "repo-pending", ".git"),
      join(root, "repo-pending", ".git"),
      "b".repeat(40),
      now,
    );
    db.prepare(
      "INSERT INTO project_sessions (session_id, project_id, name, host_id, state, source_branch, source_detached, source_commit, uncommitted_changes_excluded, managed_branch, intended_worktree_path, intended_worktree_root, canonical_worktree_path, canonical_git_dir_path, canonical_git_common_dir_path, worktree_device_id, worktree_file_id, git_dir_device_id, git_dir_file_id, common_dir_device_id, common_dir_file_id, created_at, updated_at, last_sequence) VALUES (?, ?, 'margaux2', (SELECT host_id FROM host_metadata WHERE singleton = 1), 'ready', 'main', 0, ?, 0, ?, ?, ?, ?, ?, ?, '5', '6', '7', '8', '9', '10', ?, ?, 5)",
    ).run(
      sessionId,
      projectId,
      "b".repeat(40),
      `spacezero/margaux2-${sessionId}`,
      join(root, "SpaceZero", "worktrees", projectId, sessionId),
      join(root, "SpaceZero", "worktrees", projectId),
      join(root, "SpaceZero", "worktrees", projectId, sessionId),
      join(root, "SpaceZero", "worktrees", projectId, sessionId, ".git"),
      join(root, "repo-pending", ".git"),
      now,
      now,
    );
    db.prepare(
      "INSERT INTO project_session_name_reservations (name, base_name, session_id, allocated_at) VALUES ('margaux2', 'margaux', ?, ?)",
    ).run(sessionId, now);
    db.prepare(
      "INSERT INTO project_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at) VALUES (?, 1, ?, 'UserMessageSubmittedV1', 1, ?, ?), (?, 2, ?, 'AgentTurnStartedV1', 1, ?, ?), (?, 3, ?, 'AgentMessageCompletedV1', 1, ?, ?), (?, 4, ?, 'UserMessageSubmittedV1', 1, ?, ?), (?, 5, ?, 'AgentTurnStartedV1', 1, ?, ?)",
    ).run(
      sessionId,
      randomUUID(),
      JSON.stringify({
        type: "UserMessageSubmittedV1",
        version: 1,
        sessionId,
        messageId: completedUserMessageId,
        commandId: completedCommandId,
        prompt: completedPrompt,
        timestamp: now,
      }),
      now,
      sessionId,
      randomUUID(),
      JSON.stringify({
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId,
        turnId: completedTurnId,
        messageId: completedUserMessageId,
        timestamp: now,
      }),
      now,
      sessionId,
      randomUUID(),
      JSON.stringify({
        type: "AgentMessageCompletedV1",
        version: 1,
        sessionId,
        turnId: completedTurnId,
        messageId: completedAgentMessageId,
        text: completedAnswer,
        timestamp: now,
      }),
      now,
      sessionId,
      randomUUID(),
      JSON.stringify({
        type: "UserMessageSubmittedV1",
        version: 1,
        sessionId,
        messageId: userMessageId,
        commandId,
        prompt,
        timestamp: now,
      }),
      now,
      sessionId,
      randomUUID(),
      JSON.stringify({
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId,
        turnId,
        messageId: userMessageId,
        timestamp: now,
      }),
      now,
    );
    db.prepare(
      "INSERT INTO project_session_messages (session_id, message_id, role, text, sequence, turn_id, created_at) VALUES (?, ?, 'user', ?, 1, ?, ?), (?, ?, 'assistant', ?, 3, ?, ?), (?, ?, 'user', ?, 4, ?, ?)",
    ).run(
      sessionId,
      completedUserMessageId,
      completedPrompt,
      completedTurnId,
      now,
      sessionId,
      completedAgentMessageId,
      completedAnswer,
      completedTurnId,
      now,
      sessionId,
      userMessageId,
      prompt,
      turnId,
      now,
    );
    db.prepare(
      "INSERT INTO project_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (?, ?, ?, 'succeeded', 3, ?, ?), (?, ?, ?, 'pending', 5, ?, ?)",
    ).run(
      completedCommandId,
      promptFingerprint({ sessionId, prompt: completedPrompt }),
      sessionId,
      now,
      now,
      commandId,
      promptFingerprint({ sessionId, prompt }),
      sessionId,
      now,
      now,
    );
    db.close();

    const restarted = await startHostServer({
      allowedRendererOrigin: origin,
      bootstrap: { consume: () => undefined },
      databasePath: dbPath,
      spaceZeroHome: join(root, "SpaceZero"),
    });
    hosts.push(restarted);
    const headers = clientHeaders(restarted);

    const sessions = await fetch(
      new URL("/v1/project-sessions", restarted.endpoint),
      { headers },
    );
    expect(sessions.status).toBe(200);
    await expect(sessions.json()).resolves.toMatchObject({
      sessions: [{ id: sessionId, state: "recovery_required" }],
    });

    const messages = await fetch(
      new URL(`/v1/project-sessions/${sessionId}/messages`, restarted.endpoint),
      { headers },
    );
    expect(messages.status).toBe(200);
    await expect(messages.json()).resolves.toMatchObject({
      messages: [
        { role: "user", text: completedPrompt },
        { role: "assistant", text: completedAnswer },
        { role: "user", text: prompt },
      ],
    });

    const replayCompleted = await fetch(
      new URL(`/v1/project-sessions/${sessionId}/prompts`, restarted.endpoint),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          commandId: completedCommandId,
          prompt: completedPrompt,
        }),
      },
    );
    expect(replayCompleted.status).toBe(200);
    await expect(replayCompleted.json()).resolves.toMatchObject({
      userMessage: { text: completedPrompt },
      agentMessage: { text: completedAnswer },
    });

    const duplicate = await fetch(
      new URL(`/v1/project-sessions/${sessionId}/prompts`, restarted.endpoint),
      {
        method: "POST",
        headers,
        body: JSON.stringify({ commandId, prompt }),
      },
    );
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      code: "session_recovery_required",
    });

    const check = new DatabaseSync(dbPath);
    try {
      const receipts = check
        .prepare(
          "SELECT status, terminal_error_code FROM project_session_command_receipts WHERE command_id = ?",
        )
        .all(commandId);
      expect(receipts).toEqual([
        {
          status: "recovery_required",
          terminal_error_code: "session_recovery_required",
        },
      ]);
      const events = check
        .prepare(
          "SELECT event_type FROM project_session_events WHERE session_id = ? ORDER BY sequence ASC",
        )
        .all(sessionId)
        .map((row) => (row as { event_type: string }).event_type);
      expect(events).toContain("ProjectSessionRecoveryRequiredV1");
      expect(
        events.filter((event) => event === "AgentMessageCompletedV1"),
      ).toHaveLength(1);
    } finally {
      check.close();
    }
  });
});
