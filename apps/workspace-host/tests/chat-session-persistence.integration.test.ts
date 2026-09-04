import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ConversationRunner } from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-chat-persistence-"));
  temps.push(dir);
  return dir;
};

const run = (cmd: string, args: readonly string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    execFile(cmd, args, { cwd, shell: false }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });

const gitRepo = async (root: string) => {
  const repo = join(root, "repo");
  await mkdir(repo);
  await run("git", ["init", "-q"], repo);
  await run("git", ["config", "user.email", "agent@example.invalid"], repo);
  await run("git", ["config", "user.name", "Agent"], repo);
  await writeFile(join(repo, "README.md"), "hello\n");
  await run("git", ["add", "README.md"], repo);
  await run("git", ["commit", "-q", "-m", "README.md"], repo);
  return repo;
};

const start = async (
  databasePath: string,
  spaceZeroHome: string,
  conversationRunner: ConversationRunner,
) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath,
    spaceZeroHome,
    conversationRunner,
  });
  hosts.push(host);
  return host;
};

const descriptor = (host: StartedHostServer) =>
  host.capabilities.mintClient(host.capabilities.issueSupervisor());

const authHeaders = (clientCapability: string) => ({
  Authorization: `Bearer ${clientCapability}`,
  Origin: origin,
  "Content-Type": "application/json",
});

const readRows = <A>(
  databasePath: string,
  sql: string,
  ...params: (string | number | bigint | null | Uint8Array)[]
) => {
  const db = new DatabaseSync(databasePath);
  try {
    return db.prepare(sql).all(...params) as A[];
  } finally {
    db.close();
  }
};

const waitFor = async (assertion: () => void | Promise<void>) => {
  const deadline = Date.now() + 2_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (lastError) throw lastError;
};

const registerProject = async (
  host: StartedHostServer,
  clientCapability: string,
  path: string,
) => {
  const response = await fetch(new URL("/v1/projects", host.endpoint), {
    method: "POST",
    headers: authHeaders(clientCapability),
    body: JSON.stringify({ commandId: randomUUID(), path }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { project: { id: string } };
};

const createProjectSession = async (
  host: StartedHostServer,
  clientCapability: string,
  projectId: string,
) => {
  const response = await fetch(new URL("/v1/project-sessions", host.endpoint), {
    method: "POST",
    headers: authHeaders(clientCapability),
    body: JSON.stringify({ commandId: randomUUID(), projectId }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { session: { id: string } };
};

const submitProjectPrompt = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/prompts`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId: randomUUID(), prompt: "Project prompt" }),
    },
  );
  expect(response.status).toBe(200);
};

const createGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
) => {
  const response = await fetch(
    new URL("/v1/global-chat-sessions", host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({
        commandId: randomUUID(),
        firstPrompt: "Global prompt",
      }),
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { session: { id: string } };
};

const countForSession = (
  databasePath: string,
  table: string,
  sessionId: string,
) =>
  readRows<{ count: number }>(
    databasePath,
    `SELECT count(*) AS count FROM ${table} WHERE session_id = ?`,
    sessionId,
  )[0]?.count ?? 0;

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("shared chat session persistence", () => {
  it("stores Project Sessions and Global Chat Sessions in the shared physical chat tables", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const answers = ["Project answer", "Global answer"];
    const runner: ConversationRunner = {
      submitTurn: async () => ({ text: answers.shift() ?? "answer" }),
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const repo = await gitRepo(root);
    const project = await registerProject(host, client.clientCapability, repo);
    const projectSession = await createProjectSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    await submitProjectPrompt(
      host,
      client.clientCapability,
      projectSession.session.id,
    );
    const globalSession = await createGlobalChatSession(
      host,
      client.clientCapability,
    );

    await waitFor(() => {
      expect(
        countForSession(
          databasePath,
          "chat_session_messages",
          projectSession.session.id,
        ),
      ).toBeGreaterThanOrEqual(2);
      expect(
        countForSession(
          databasePath,
          "chat_session_messages",
          globalSession.session.id,
        ),
      ).toBeGreaterThanOrEqual(2);
    });

    const sessions = readRows<{ session_id: string; kind: string }>(
      databasePath,
      "SELECT session_id, kind FROM chat_sessions ORDER BY kind DESC",
    );
    expect(sessions).toEqual(
      expect.arrayContaining([
        { session_id: projectSession.session.id, kind: "project" },
        { session_id: globalSession.session.id, kind: "global" },
      ]),
    );

    expect(
      countForSession(
        databasePath,
        "project_session_bindings",
        projectSession.session.id,
      ),
    ).toBe(1);
    expect(
      countForSession(
        databasePath,
        "project_session_bindings",
        globalSession.session.id,
      ),
    ).toBe(0);

    for (const table of [
      "chat_session_events",
      "chat_session_messages",
      "chat_session_turns",
      "chat_session_runtime_configurations",
      "chat_session_pi_contexts",
      "chat_session_command_receipts",
    ]) {
      expect(countForSession(databasePath, table, projectSession.session.id)).toBeGreaterThan(0);
      expect(countForSession(databasePath, table, globalSession.session.id)).toBeGreaterThan(0);
    }

    const eventTypes = readRows<{ session_id: string; event_type: string }>(
      databasePath,
      "SELECT session_id, event_type FROM chat_session_events ORDER BY sequence ASC",
    );
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        {
          session_id: projectSession.session.id,
          event_type: "ProjectSessionCreationRequestedV1",
        },
        {
          session_id: projectSession.session.id,
          event_type: "UserMessageSubmittedV1",
        },
        {
          session_id: globalSession.session.id,
          event_type: "GlobalChatSessionCreatedV1",
        },
        {
          session_id: globalSession.session.id,
          event_type: "GlobalChatUserMessageSubmittedV1",
        },
      ]),
    );

    const chatSessionColumns = readRows<{ name: string }>(
      databasePath,
      "PRAGMA table_info(chat_sessions)",
    ).map((row) => row.name);
    expect(chatSessionColumns).not.toEqual(
      expect.arrayContaining([
        "project_id",
        "name",
        "managed_branch",
        "intended_worktree_path",
        "source_commit",
        "canonical_worktree_path",
        "canonical_git_dir_path",
        "canonical_git_common_dir_path",
      ]),
    );

    const oldTables = [
      "project_sessions",
      "project_session_events",
      "project_session_messages",
      "project_session_turns",
      "project_session_runtime_configurations",
      "project_session_pi_contexts",
      "project_session_command_receipts",
      "global_chat_sessions",
      "global_chat_session_events",
      "global_chat_messages",
      "global_chat_session_turns",
      "global_chat_session_runtime_configurations",
      "global_chat_session_pi_contexts",
      "global_chat_session_command_receipts",
    ];
    const staleTables = readRows<{ name: string }>(
      databasePath,
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${oldTables.map(() => "?").join(", ")})`,
      ...oldTables,
    );
    expect(staleTables).toEqual([]);
  });
});
