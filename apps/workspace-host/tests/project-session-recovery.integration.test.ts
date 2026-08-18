import { randomUUID } from "node:crypto";
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
});
