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
import { seedAgentRuntimeDefaults } from "./agent-runtime-defaults.helpers.js";

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
  seedAgentRuntimeDefaults(databasePath);
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

const executeSql = (databasePath: string, sql: string) => {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
};

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

const installAssistantMessageFailureTrigger = (
  databasePath: string,
  triggerName: string,
  answerText: string,
) => {
  executeSql(
    databasePath,
    `CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON chat_session_messages
      WHEN NEW.role = 'assistant' AND NEW.text = ${sqlString(answerText)}
      BEGIN
        SELECT RAISE(FAIL, 'test assistant message persistence failure');
      END;`,
  );
};

const readSseFrames = async (
  response: Response,
  frameCount: number,
): Promise<readonly { id?: string; event?: string; data: unknown }[]> => {
  if (!response.body) throw new Error("missing SSE body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const frames: { id?: string; event?: string; data: unknown }[] = [];
  while (frames.length < frameCount) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffered += decoder.decode(chunk.value, { stream: true });
    const parts = buffered.split("\n\n");
    buffered = parts.pop() ?? "";
    for (const part of parts) {
      let id: string | undefined;
      let event: string | undefined;
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("id:")) id = line.slice(3).trim();
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trimStart();
      }
      if (data) {
        frames.push({
          ...(id === undefined ? {} : { id }),
          ...(event === undefined ? {} : { event }),
          data: JSON.parse(data) as unknown,
        });
      }
    }
  }
  void reader.cancel().catch(() => undefined);
  return frames;
};

const delayedAnswerRunner = (answerText: string) => {
  let release!: () => void;
  let started!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const prompts: string[] = [];
  const runner: ConversationRunner = {
    submitTurn: async (input) => {
      prompts.push(input.prompt);
      started();
      await releasePromise;
      return { text: answerText };
    },
  };
  return { runner, release, started: startedPromise, prompts };
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
  prompt = "Project prompt",
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/prompts`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId, prompt }),
    },
  );
  const text = await response.text();
  return {
    response,
    body: text.length > 0 ? (JSON.parse(text) as unknown) : undefined,
  };
};

const listProjectMessages = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/messages`, host.endpoint),
    { headers: authHeaders(clientCapability) },
  );
  return { response, body: (await response.json()) as unknown };
};

const enqueueProjectFollowUp = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  prompt: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/follow-ups`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId, prompt }),
    },
  );
  return { response, body: (await response.json()) as unknown };
};

const listProjectFollowUps = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/follow-ups`, host.endpoint),
    { headers: authHeaders(clientCapability) },
  );
  return { response, body: (await response.json()) as unknown };
};

const subscribeProjectEvents = (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  after: number,
) =>
  fetch(
    new URL(
      `/v1/project-sessions/${sessionId}/events?after=${after}`,
      host.endpoint,
    ),
    { headers: authHeaders(clientCapability) },
  );

const createGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
  firstPrompt = "Global prompt",
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL("/v1/global-chat-sessions", host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({
        commandId,
        firstPrompt,
      }),
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { session: { id: string } };
};

const submitGlobalChatPrompt = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  prompt: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/prompts`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId, prompt }),
    },
  );
  return { response, body: (await response.json()) as unknown };
};

const listGlobalChatMessages = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/messages`, host.endpoint),
    { headers: authHeaders(clientCapability) },
  );
  return { response, body: (await response.json()) as unknown };
};

const enqueueGlobalChatFollowUp = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  prompt: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/follow-ups`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId, prompt }),
    },
  );
  return { response, body: (await response.json()) as unknown };
};

const listGlobalChatFollowUps = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/follow-ups`, host.endpoint),
    { headers: authHeaders(clientCapability) },
  );
  return { response, body: (await response.json()) as unknown };
};

const subscribeGlobalChatEvents = (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  after: number,
) =>
  fetch(
    new URL(
      `/v1/global-chat-sessions/${sessionId}/events?after=${after}`,
      host.endpoint,
    ),
    { headers: authHeaders(clientCapability) },
  );

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
  it("surfaces Project Session SQLite write faults through HTTP/SSE and keeps recovery non-replayed after restart", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const turn = delayedAnswerRunner("Project answer blocked by SQLite");
    const host = await start(
      databasePath,
      join(root, "SpaceZero"),
      turn.runner,
    );
    const client = descriptor(host);
    const repo = await gitRepo(root);
    const project = await registerProject(host, client.clientCapability, repo);
    const projectSession = await createProjectSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const submitted = await submitProjectPrompt(
      host,
      client.clientCapability,
      projectSession.session.id,
      "active project prompt",
    );
    expect(submitted.response.status).toBe(200);
    await turn.started;

    const followUpCommandId = randomUUID();
    const queued = await enqueueProjectFollowUp(
      host,
      client.clientCapability,
      projectSession.session.id,
      "queued project prompt must not replay",
      followUpCommandId,
    );
    expect(queued.response.status).toBe(200);
    expect(queued.body).toMatchObject({
      followUp: { commandId: followUpCommandId, state: "queued" },
    });

    installAssistantMessageFailureTrigger(
      databasePath,
      "project_answer_storage_failure",
      "Project answer blocked by SQLite",
    );
    const beforeFault = await listProjectMessages(
      host,
      client.clientCapability,
      projectSession.session.id,
    );
    expect(beforeFault.response.status).toBe(200);
    const after = (beforeFault.body as { session: { lastSequence: number } })
      .session.lastSequence;
    const stream = await subscribeProjectEvents(
      host,
      client.clientCapability,
      projectSession.session.id,
      after,
    );
    expect(stream.status).toBe(200);

    turn.release();
    const frames = await readSseFrames(stream, 2);
    expect(
      frames.map((frame) => (frame.data as { eventType: string }).eventType),
    ).toEqual(
      expect.arrayContaining([
        "ConversationPersistenceFailedV1",
        "ProjectSessionRecoveryRequiredV1",
      ]),
    );
    expect(
      frames.find(
        (frame) =>
          (frame.data as { eventType: string }).eventType ===
          "ConversationPersistenceFailedV1",
      ),
    ).toMatchObject({ event: "project-session.live" });

    await waitFor(async () => {
      const listed = await listProjectMessages(
        host,
        client.clientCapability,
        projectSession.session.id,
      );
      expect(listed.response.status).toBe(200);
      expect(listed.body).toMatchObject({
        session: { state: "recovery_required" },
        messages: [{ role: "user", text: "active project prompt" }],
        activeTurn: {
          state: "recovery_required",
          failureReason: "session_recovery_required",
        },
        latestTurn: {
          state: "recovery_required",
          failureReason: "session_recovery_required",
        },
      });
    });
    const followUpsAfterFault = await listProjectFollowUps(
      host,
      client.clientCapability,
      projectSession.session.id,
    );
    expect(followUpsAfterFault.response.status).toBe(200);
    expect(followUpsAfterFault.body).toMatchObject({
      followUps: [{ commandId: followUpCommandId, state: "queued" }],
    });
    expect(turn.prompts).toEqual(["active project prompt"]);

    const blocked = await submitProjectPrompt(
      host,
      client.clientCapability,
      projectSession.session.id,
      "manual project prompt must wait for recovery",
    );
    expect(blocked.response.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "session_recovery_required" });

    await host.stop();
    const restartedPrompts: string[] = [];
    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      {
        submitTurn: async (input) => {
          restartedPrompts.push(input.prompt);
          return { text: "unexpected replay" };
        },
      },
    );
    const restartedClient = descriptor(restarted);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(restartedPrompts).toEqual([]);

    const reloaded = await listProjectMessages(
      restarted,
      restartedClient.clientCapability,
      projectSession.session.id,
    );
    expect(reloaded.response.status).toBe(200);
    expect(reloaded.body).toMatchObject({
      session: { state: "recovery_required" },
      messages: [{ role: "user", text: "active project prompt" }],
      activeTurn: {
        state: "recovery_required",
        failureReason: "session_recovery_required",
      },
    });
    expect(
      (reloaded.body as { messages: readonly { text: string }[] }).messages.map(
        (message) => message.text,
      ),
    ).not.toContain("queued project prompt must not replay");
    const queuedAfterRestart = await listProjectFollowUps(
      restarted,
      restartedClient.clientCapability,
      projectSession.session.id,
    );
    expect(queuedAfterRestart.response.status).toBe(200);
    expect(queuedAfterRestart.body).toMatchObject({
      followUps: [{ commandId: followUpCommandId, state: "queued" }],
    });
    const blockedAfterRestart = await submitProjectPrompt(
      restarted,
      restartedClient.clientCapability,
      projectSession.session.id,
      "post-restart project prompt must wait for recovery",
    );
    expect(blockedAfterRestart.response.status).toBe(409);
    expect(blockedAfterRestart.body).toMatchObject({
      code: "session_not_ready",
    });
  });

  it("surfaces Global Chat SQLite write faults through HTTP/SSE and keeps recovery non-replayed after restart", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const turn = delayedAnswerRunner("Global answer blocked by SQLite");
    const host = await start(
      databasePath,
      join(root, "SpaceZero"),
      turn.runner,
    );
    const client = descriptor(host);

    const globalSession = await createGlobalChatSession(
      host,
      client.clientCapability,
      "active global prompt",
    );
    await turn.started;

    const followUpCommandId = randomUUID();
    const queued = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      globalSession.session.id,
      "queued global prompt must not replay",
      followUpCommandId,
    );
    expect(queued.response.status).toBe(200);
    expect(queued.body).toMatchObject({
      followUp: { commandId: followUpCommandId, state: "queued" },
    });

    installAssistantMessageFailureTrigger(
      databasePath,
      "global_answer_storage_failure",
      "Global answer blocked by SQLite",
    );
    const beforeFault = await listGlobalChatMessages(
      host,
      client.clientCapability,
      globalSession.session.id,
    );
    expect(beforeFault.response.status).toBe(200);
    const after = (beforeFault.body as { session: { lastSequence: number } })
      .session.lastSequence;
    const stream = await subscribeGlobalChatEvents(
      host,
      client.clientCapability,
      globalSession.session.id,
      after,
    );
    expect(stream.status).toBe(200);

    turn.release();
    const frames = await readSseFrames(stream, 2);
    expect(
      frames.map((frame) => (frame.data as { eventType: string }).eventType),
    ).toEqual(
      expect.arrayContaining([
        "GlobalChatConversationPersistenceFailedV1",
        "GlobalChatAgentTurnFailedV1",
      ]),
    );
    expect(
      frames.find(
        (frame) =>
          (frame.data as { eventType: string }).eventType ===
          "GlobalChatConversationPersistenceFailedV1",
      ),
    ).toMatchObject({ event: "global-chat-session.live" });

    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        client.clientCapability,
        globalSession.session.id,
      );
      expect(listed.response.status).toBe(200);
      expect(listed.body).toMatchObject({
        messages: [{ role: "user", text: "active global prompt" }],
        activeTurn: {
          state: "recovery_required",
          failureReason: "global_chat_session_recovery_required",
        },
        latestTurn: {
          state: "recovery_required",
          failureReason: "global_chat_session_recovery_required",
        },
      });
    });
    const followUpsAfterFault = await listGlobalChatFollowUps(
      host,
      client.clientCapability,
      globalSession.session.id,
    );
    expect(followUpsAfterFault.response.status).toBe(200);
    expect(followUpsAfterFault.body).toMatchObject({
      followUps: [{ commandId: followUpCommandId, state: "queued" }],
    });
    expect(turn.prompts).toEqual(["active global prompt"]);

    const blocked = await submitGlobalChatPrompt(
      host,
      client.clientCapability,
      globalSession.session.id,
      "manual global prompt must wait for recovery",
    );
    expect(blocked.response.status).toBe(409);
    expect(blocked.body).toMatchObject({
      code: "global_chat_session_recovery_required",
    });

    await host.stop();
    const restartedPrompts: string[] = [];
    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      {
        submitTurn: async (input) => {
          restartedPrompts.push(input.prompt);
          return { text: "unexpected replay" };
        },
      },
    );
    const restartedClient = descriptor(restarted);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(restartedPrompts).toEqual([]);

    const reloaded = await listGlobalChatMessages(
      restarted,
      restartedClient.clientCapability,
      globalSession.session.id,
    );
    expect(reloaded.response.status).toBe(200);
    expect(reloaded.body).toMatchObject({
      messages: [{ role: "user", text: "active global prompt" }],
      activeTurn: {
        state: "recovery_required",
        failureReason: "global_chat_session_recovery_required",
      },
    });
    expect(
      (reloaded.body as { messages: readonly { text: string }[] }).messages.map(
        (message) => message.text,
      ),
    ).not.toContain("queued global prompt must not replay");
    const queuedAfterRestart = await listGlobalChatFollowUps(
      restarted,
      restartedClient.clientCapability,
      globalSession.session.id,
    );
    expect(queuedAfterRestart.response.status).toBe(200);
    expect(queuedAfterRestart.body).toMatchObject({
      followUps: [{ commandId: followUpCommandId, state: "queued" }],
    });
    const blockedAfterRestart = await submitGlobalChatPrompt(
      restarted,
      restartedClient.clientCapability,
      globalSession.session.id,
      "post-restart global prompt must wait for recovery",
    );
    expect(blockedAfterRestart.response.status).toBe(409);
    expect(blockedAfterRestart.body).toMatchObject({
      code: "global_chat_session_turn_in_progress",
    });
  });

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

    const submitted = await submitProjectPrompt(
      host,
      client.clientCapability,
      projectSession.session.id,
    );
    expect(submitted.response.status).toBe(200);
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
