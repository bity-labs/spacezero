import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgentTurnError,
  createScriptedConversationRunner,
  type AgentTurnInput,
  type ConversationRunner,
  type PiModelCatalogService,
} from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-session-prompt-"));
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
  conversationRunner?: ConversationRunner,
  clientCapabilityTtlMs?: number,
  modelCatalog?: PiModelCatalogService,
) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath,
    spaceZeroHome,
    conversationRunner:
      conversationRunner ?? createScriptedConversationRunner(),
    ...(clientCapabilityTtlMs === undefined ? {} : { clientCapabilityTtlMs }),
    ...(modelCatalog === undefined ? {} : { modelCatalog }),
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
const createSession = async (
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
const submitPrompt = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  prompt: string,
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

const subscribeEvents = (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  after: number,
  init?: RequestInit,
) =>
  fetch(
    new URL(
      `/v1/project-sessions/${sessionId}/events?after=${after}`,
      host.endpoint,
    ),
    {
      headers: authHeaders(clientCapability),
      ...init,
    },
  );

const interruptTurn = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  turnId: string,
) => {
  const response = await fetch(
    new URL(
      `/v1/project-sessions/${sessionId}/turns/${turnId}/interrupt`,
      host.endpoint,
    ),
    { method: "POST", headers: authHeaders(clientCapability) },
  );
  const text = await response.text();
  return {
    response,
    body: text.length > 0 ? (JSON.parse(text) as unknown) : undefined,
  };
};
const getRuntime = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/runtime`, host.endpoint),
    {
      headers: authHeaders(clientCapability),
    },
  );
  return {
    response,
    body: (await response.json()) as unknown,
  };
};
const updateRuntime = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly defaultThinkingLevel: string;
    readonly expectedRevision: number;
  },
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/runtime`, host.endpoint),
    {
      method: "PUT",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId, ...input }),
    },
  );
  return {
    response,
    body: (await response.json()) as unknown,
  };
};
const listMessages = async (
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
const waitForMessageCount = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  count: number,
) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const listed = await listMessages(host, clientCapability, sessionId);
    const body = listed.body as { messages?: unknown[] };
    if ((body.messages?.length ?? 0) >= count) return listed;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return listMessages(host, clientCapability, sessionId);
};
const piConversationId = (databasePath: string, sessionId: string): string => {
  const db = new DatabaseSync(databasePath);
  try {
    const row = db
      .prepare(
        "SELECT conversation_id FROM chat_session_pi_contexts WHERE session_id = ?",
      )
      .get(sessionId) as { conversation_id: string } | undefined;
    expect(row).toBeDefined();
    return row?.conversation_id ?? "";
  } finally {
    db.close();
  }
};
const eventTypes = (databasePath: string, sessionId: string): string[] => {
  const db = new DatabaseSync(databasePath);
  try {
    const rows = db
      .prepare(
        "SELECT event_type FROM chat_session_events WHERE session_id = ? ORDER BY sequence ASC",
      )
      .all(sessionId) as { event_type: string }[];
    return rows.map((row) => row.event_type);
  } finally {
    db.close();
  }
};

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("Session prompt Host protocol", () => {
  it("persists and snapshots per-Session runtime configuration", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const seen: AgentTurnInput[] = [];
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        seen.push(input);
        await input.onEvent?.({ type: "assistant_delta", text: "ok" });
        return { text: "ok" };
      },
    };
    const validated: unknown[] = [];
    const modelCatalog: PiModelCatalogService = {
      listModels: async () => [],
      validateSelection: async (selection) => {
        validated.push(selection);
      },
    };
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      runner,
      undefined,
      modelCatalog,
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const runtime = await getRuntime(
      host,
      client.clientCapability,
      created.session.id,
    );
    expect(runtime.response.status).toBe(200);
    expect(runtime.body).toMatchObject({
      runtime: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        defaultThinkingLevel: "off",
        revision: 1,
      },
    });

    const firstRuntimeCommandId = randomUUID();
    const updated = await updateRuntime(
      host,
      client.clientCapability,
      created.session.id,
      {
        providerId: "openai",
        modelId: "gpt-5",
        defaultThinkingLevel: "high",
        expectedRevision: 1,
      },
      firstRuntimeCommandId,
    );
    expect(updated.response.status).toBe(200);
    expect(updated.body).toMatchObject({
      runtime: {
        providerId: "openai",
        modelId: "gpt-5",
        defaultThinkingLevel: "high",
        revision: 2,
      },
    });

    const stale = await updateRuntime(
      host,
      client.clientCapability,
      created.session.id,
      {
        providerId: "openai",
        modelId: "gpt-5-mini",
        defaultThinkingLevel: "off",
        expectedRevision: 1,
      },
    );
    expect(stale.response.status).toBe(409);
    expect(stale.body).toMatchObject({
      code: "session_runtime_revision_conflict",
    });

    const submitted = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "snapshot runtime",
    );
    expect(submitted.response.status).toBe(200);
    expect(submitted.body).toMatchObject({
      turn: {
        providerId: "openai",
        modelId: "gpt-5",
        thinkingLevel: "high",
      },
    });
    await waitForMessageCount(
      host,
      client.clientCapability,
      created.session.id,
      2,
    );
    expect(seen[0]?.runtime).toEqual({
      providerId: "openai",
      modelId: "gpt-5",
      thinkingLevel: "high",
    });
    expect(validated).toContainEqual({
      providerId: "openai",
      modelId: "gpt-5",
      thinkingLevel: "high",
    });

    const secondUpdate = await updateRuntime(
      host,
      client.clientCapability,
      created.session.id,
      {
        providerId: "openai",
        modelId: "gpt-5-mini",
        defaultThinkingLevel: "off",
        expectedRevision: 2,
      },
    );
    expect(secondUpdate.response.status).toBe(200);
    expect(secondUpdate.body).toMatchObject({
      runtime: { modelId: "gpt-5-mini", revision: 3 },
    });
    const replayedFirstUpdate = await updateRuntime(
      host,
      client.clientCapability,
      created.session.id,
      {
        providerId: "openai",
        modelId: "gpt-5",
        defaultThinkingLevel: "high",
        expectedRevision: 1,
      },
      firstRuntimeCommandId,
    );
    expect(replayedFirstUpdate.response.status).toBe(200);
    expect(replayedFirstUpdate.body).toMatchObject({
      runtime: {
        providerId: "openai",
        modelId: "gpt-5",
        defaultThinkingLevel: "high",
        revision: 2,
      },
    });

    const database = new DatabaseSync(join(root, "host.sqlite"));
    try {
      const context = database
        .prepare(
          "SELECT adapter_name, adapter_schema_version, adapter_state_json, last_turn_id FROM chat_session_pi_contexts WHERE session_id = ?",
        )
        .get(created.session.id) as {
        adapter_name: string;
        adapter_schema_version: number;
        adapter_state_json: string;
        last_turn_id: string;
      };
      expect(context).toEqual({
        adapter_name: "pi-agent-core",
        adapter_schema_version: 1,
        adapter_state_json: "{}",
        last_turn_id: (submitted.body as { turn: { id: string } }).turn.id,
      });
    } finally {
      database.close();
    }
  });

  it("submits a prompt, runs the turn in the managed worktree, and journals message boundaries", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const seen: AgentTurnInput[] = [];
    const runner = createScriptedConversationRunner({
      respond: (input) => {
        seen.push(input);
        return `Echo: ${input.prompt}`;
      },
    });
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const sessionId = created.session.id;

    const submitted = await submitPrompt(
      host,
      client.clientCapability,
      sessionId,
      "Build the wine list view",
    );

    expect(submitted.response.status).toBe(200);
    const body = submitted.body as {
      session: { id: string; state: string; lastSequence: number };
      userMessage: {
        id: string;
        role: string;
        text: string;
        sequence: number;
      };
      turn: {
        id: string;
        state: string;
        assistantMessageId: string;
      };
    };
    expect(body.session.id).toBe(sessionId);
    expect(body.session.state).toBe("ready");
    expect(body.userMessage.role).toBe("user");
    expect(body.userMessage.text).toBe("Build the wine list view");
    expect(body.turn.state).toBe("running");
    const listed = await waitForMessageCount(
      host,
      client.clientCapability,
      sessionId,
      2,
    );
    const messagesBody = listed.body as {
      session: { id: string; lastSequence: number };
      messages: { id: string; role: string; text: string; sequence: number }[];
    };
    const agentMessage = messagesBody.messages[1]!;
    expect(agentMessage.role).toBe("assistant");
    expect(agentMessage.text).toBe("Echo: Build the wine list view");
    expect(agentMessage.sequence).toBe(body.userMessage.sequence + 2);
    expect(seen).toHaveLength(1);
    const canonicalHome = await realpath(join(root, "SpaceZero"));
    expect(seen[0]?.tools).toMatchObject({
      kind: "managedWorktree",
      workingDirectory: join(
        canonicalHome,
        "worktrees",
        project.project.id,
        sessionId,
      ),
      enabledToolNames: ["read", "write", "edit"],
    });
    expect(eventTypes(databasePath, sessionId)).toEqual([
      "ProjectSessionCreationRequestedV1",
      "ProjectSessionRuntimeConfiguredV1",
      "SessionWorkspacePreparationStartedV1",
      "SessionWorkspacePreparedV1",
      "ProjectSessionReadyV1",
      "UserMessageSubmittedV1",
      "AgentTurnStartedV1",
      "AgentMessageCompletedV1",
    ]);

    expect(listed.response.status).toBe(200);
    expect(messagesBody.session.id).toBe(sessionId);
    expect(messagesBody.messages).toMatchObject([
      {
        id: body.userMessage.id,
        role: "user",
        text: "Build the wine list view",
      },
      {
        id: body.turn.assistantMessageId,
        role: "assistant",
        text: "Echo: Build the wine list view",
      },
    ]);
  });

  it("completes turns after durable tool activity events", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "tool_started",
          toolCallId: "tool-1",
          toolName: "read",
        });
        await input.onEvent?.({
          type: "tool_completed",
          toolCallId: "tool-1",
          toolName: "read",
          isError: false,
        });
        return { text: "tool-assisted answer" };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const submitted = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "use a tool",
    );
    expect(submitted.response.status).toBe(200);
    const listed = await waitForMessageCount(
      host,
      client.clientCapability,
      created.session.id,
      2,
    );

    expect(listed.body).toMatchObject({
      messages: [
        { role: "user", text: "use a tool" },
        { role: "assistant", text: "tool-assisted answer" },
      ],
    });
    expect(eventTypes(databasePath, created.session.id)).toEqual([
      "ProjectSessionCreationRequestedV1",
      "ProjectSessionRuntimeConfiguredV1",
      "SessionWorkspacePreparationStartedV1",
      "SessionWorkspacePreparedV1",
      "ProjectSessionReadyV1",
      "UserMessageSubmittedV1",
      "AgentTurnStartedV1",
      "AgentToolCallStartedV1",
      "AgentToolCallCompletedV1",
      "AgentMessageCompletedV1",
    ]);
  });

  it("uses one durable Pi conversation context per Session and carries prior messages into later turns", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const seen: AgentTurnInput[] = [];
    const runner = createScriptedConversationRunner({
      respond: (input) => {
        seen.push(input);
        return `history=${input.history.length}; prompt=${input.prompt}`;
      },
    });
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const first = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const second = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    await submitPrompt(
      host,
      client.clientCapability,
      first.session.id,
      "first prompt",
    );
    await submitPrompt(
      host,
      client.clientCapability,
      first.session.id,
      "second prompt",
    );
    await submitPrompt(
      host,
      client.clientCapability,
      second.session.id,
      "other session prompt",
    );
    await waitForMessageCount(
      host,
      client.clientCapability,
      second.session.id,
      2,
    );

    const firstConversationId = piConversationId(
      databasePath,
      first.session.id,
    );
    expect(firstConversationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(piConversationId(databasePath, second.session.id)).not.toBe(
      firstConversationId,
    );
    expect(seen.map((input) => input.conversationId)).toEqual([
      firstConversationId,
      firstConversationId,
      piConversationId(databasePath, second.session.id),
    ]);
    expect(seen[0]?.sessionId).toBe(first.session.id);
    expect(seen[0]?.history).toEqual([]);
    expect(seen[1]?.history).toEqual([
      { role: "user", text: "first prompt" },
      { role: "assistant", text: "history=0; prompt=first prompt" },
    ]);
    expect(seen[1]?.tools).toMatchObject({
      kind: "managedWorktree",
      enabledToolNames: ["read", "write", "edit"],
    });
    expect(seen[2]?.history).toEqual([]);
  });

  it("streams durable Session events with catch-up cursors", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const prompt = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "stream events please",
    );
    expect(prompt.response.status).toBe(200);

    await waitForMessageCount(
      host,
      client.clientCapability,
      created.session.id,
      2,
    );
    const catchup = await subscribeEvents(
      host,
      client.clientCapability,
      created.session.id,
      0,
    );
    expect(catchup.status).toBe(200);
    const frames = await readSseFrames(catchup, 8);
    expect(frames.map((frame) => frame.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    expect(
      frames.every((frame) => frame.event === "project-session.event"),
    ).toBe(true);
    expect(
      frames.map((frame) => (frame.data as { eventType: string }).eventType),
    ).toEqual([
      "ProjectSessionCreationRequestedV1",
      "ProjectSessionRuntimeConfiguredV1",
      "SessionWorkspacePreparationStartedV1",
      "SessionWorkspacePreparedV1",
      "ProjectSessionReadyV1",
      "UserMessageSubmittedV1",
      "AgentTurnStartedV1",
      "AgentMessageCompletedV1",
    ]);
    const streamedEvents = frames.map(
      (frame) => (frame.data as { event: Record<string, unknown> }).event,
    );
    expect(Object.keys(streamedEvents[0]!).sort()).toEqual(
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
    expect(Object.keys(streamedEvents[3]!).sort()).toEqual(
      ["type", "version", "sessionId", "timestamp"].sort(),
    );
    const serializedFrames = JSON.stringify(frames);
    expect(serializedFrames).not.toContain("sk-");
    expect(serializedFrames).not.toContain("hostId");
    expect(serializedFrames).not.toContain(root);
    expect(serializedFrames).not.toContain("SpaceZero");
    expect(serializedFrames).not.toContain("worktreePath");
    expect(serializedFrames).not.toContain("worktreeRoot");
    expect(serializedFrames).not.toContain("canonicalWorktreePath");
    expect(serializedFrames).not.toContain("canonicalGitDirPath");
    expect(serializedFrames).not.toContain("canonicalGitCommonDirPath");
    expect(serializedFrames).not.toMatch(/DeviceId|FileId/);

    const controller = new AbortController();
    const afterLast = await subscribeEvents(
      host,
      client.clientCapability,
      created.session.id,
      7,
      { signal: controller.signal },
    );
    expect(afterLast.status).toBe(200);
    const reader = afterLast.body!.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    await expect(
      Promise.race([
        reader.read().then(() => "event"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
      ]),
    ).resolves.toBe("timeout");
    controller.abort();
    void reader.cancel().catch(() => undefined);
  });

  it("stops delivering Session events when the client capability expires", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      undefined,
      1_000,
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const current = created.session as { id: string; lastSequence: number };

    const stream = await subscribeEvents(
      host,
      client.clientCapability,
      current.id,
      current.lastSequence,
    );
    expect(stream.status).toBe(200);
    if (!stream.body) throw new Error("missing SSE body");
    const reader = stream.body.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const freshClient = descriptor(host);
    const submitted = await submitPrompt(
      host,
      freshClient.clientCapability,
      current.id,
      "after expiry",
    );
    expect(submitted.response.status).toBe(200);

    await expect(
      Promise.race([
        reader.read().then((read) => (read.done ? "closed" : "event")),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 200)),
      ]),
    ).resolves.not.toBe("event");
    void reader.cancel().catch(() => undefined);
  });

  it("persists bounded assistant checkpoints and exposes an active turn draft", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    let release!: () => void;
    let checkpointed!: () => void;
    const checkpointedPromise = new Promise<void>((resolve) => {
      checkpointed = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "assistant_delta",
          text: "x".repeat(2_048),
        });
        checkpointed();
        await releasePromise;
        return { text: "x".repeat(2_048) };
      },
    };
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      runner,
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const submitted = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "checkpoint please",
    );
    expect(submitted.response.status).toBe(200);
    await checkpointedPromise;

    const listed = await listMessages(
      host,
      client.clientCapability,
      created.session.id,
    );
    expect(listed.response.status).toBe(200);
    expect(listed.body).toMatchObject({
      activeTurn: {
        id: (submitted.body as { turn: { id: string } }).turn.id,
        state: "running",
        draftText: "x".repeat(2_048),
      },
    });
    const database = new DatabaseSync(join(root, "host.sqlite"));
    try {
      const checkpointCount = database
        .prepare(
          "SELECT count(*) AS count FROM chat_session_events WHERE event_type = 'AgentMessageCheckpointedV1'",
        )
        .get() as { count: number };
      expect(checkpointCount.count).toBe(1);
    } finally {
      database.close();
    }
    release();
    await waitForMessageCount(
      host,
      client.clientCapability,
      created.session.id,
      2,
    );
  });

  it("delivers live Session events committed after subscription", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const current = created.session as { id: string; lastSequence: number };
    const live = await subscribeEvents(
      host,
      client.clientCapability,
      current.id,
      current.lastSequence,
    );
    expect(live.status).toBe(200);

    const submitted = submitPrompt(
      host,
      client.clientCapability,
      current.id,
      "live event",
    );
    const frames = await readSseFrames(live, 4);
    await submitted;

    const durableFrames = frames.filter((frame) => frame.id !== undefined);
    const liveFrames = frames.filter((frame) => frame.id === undefined);
    expect(durableFrames.map((frame) => frame.id)).toEqual(["6", "7", "8"]);
    expect(
      liveFrames.map(
        (frame) => (frame.data as { eventType: string }).eventType,
      ),
    ).toContain("AssistantTextDeltaV1");
    expect(
      durableFrames.map(
        (frame) => (frame.data as { eventType: string }).eventType,
      ),
    ).toEqual([
      "UserMessageSubmittedV1",
      "AgentTurnStartedV1",
      "AgentMessageCompletedV1",
    ]);
  });

  it("interrupts an active background turn and journals the interruption", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: (input) =>
        new Promise((_, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => reject(new AgentTurnError("agent_turn_interrupted")),
            { once: true },
          );
        }),
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const submitted = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "please wait",
    );
    expect(submitted.response.status).toBe(200);
    const turnId = (submitted.body as { turn: { id: string } }).turn.id;

    const interrupted = await interruptTurn(
      host,
      client.clientCapability,
      created.session.id,
      turnId,
    );

    expect(interrupted.response.status).toBe(200);
    expect(interrupted.body).toMatchObject({
      turn: { id: turnId, state: "interrupted" },
    });
    const secondInterrupt = await interruptTurn(
      host,
      client.clientCapability,
      created.session.id,
      turnId,
    );
    expect(secondInterrupt.response.status).toBe(200);
    expect(secondInterrupt.body).toMatchObject({
      turn: { id: turnId, state: "interrupted" },
    });
    const events = eventTypes(databasePath, created.session.id);
    expect(events).toContain("AgentTurnInterruptedV1");
    expect(events).not.toContain("AgentTurnFailedV1");
  });

  it("denies unauthorized or wrong-origin Session event streams", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const unauthorized = await fetch(
      new URL(
        `/v1/project-sessions/${created.session.id}/events?after=0`,
        host.endpoint,
      ),
      { headers: { Origin: origin } },
    );
    expect(unauthorized.status).toBe(401);
    const wrongOrigin = await fetch(
      new URL(
        `/v1/project-sessions/${created.session.id}/events?after=0`,
        host.endpoint,
      ),
      {
        headers: {
          Authorization: `Bearer ${client.clientCapability}`,
          Origin: "https://evil.invalid",
        },
      },
    );
    expect(wrongOrigin.status).toBe(403);

    const unknown = await fetch(
      new URL(
        `/v1/project-sessions/${randomUUID()}/events?after=0`,
        host.endpoint,
      ),
      { headers: authHeaders(client.clientCapability) },
    );
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({
      code: "session_not_found",
    });
  });

  it("replays duplicate prompt commands and rejects reused command IDs with different input", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const commandId = randomUUID();

    const first = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "First prompt",
      commandId,
    );
    const replayed = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "First prompt",
      commandId,
    );
    const conflict = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "Different prompt",
      commandId,
    );

    expect(first.response.status).toBe(200);
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      turn: { id: (first.body as { turn: { id: string } }).turn.id },
      userMessage: {
        id: (first.body as { userMessage: { id: string } }).userMessage.id,
      },
    });
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "command_id_conflict" });
  });

  it("rejects additional prompts while a turn is active", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    let release!: () => void;
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: ConversationRunner = {
      submitTurn: async () => {
        await releasePromise;
        return { text: "done" };
      },
    };
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      runner,
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const first = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "one",
    );
    const second = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "two",
    );

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(409);
    expect(second.body).toMatchObject({ code: "session_turn_in_progress" });
    release();
    await waitForMessageCount(
      host,
      client.clientCapability,
      created.session.id,
      2,
    );
  });

  it("rejects prompts for unknown or not-ready Sessions", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath, join(root, "SpaceZero"));
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const missing = await submitPrompt(
      host,
      client.clientCapability,
      randomUUID(),
      "hello",
    );
    expect(missing.response.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "session_not_found" });

    const db = new DatabaseSync(databasePath);
    db.prepare("UPDATE project_session_bindings SET state = 'recovery_required'").run();
    db.close();

    const notReady = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "hello",
    );
    expect(notReady.response.status).toBe(409);
    expect(notReady.body).toMatchObject({ code: "session_not_ready" });
    const messages = await listMessages(
      host,
      client.clientCapability,
      created.session.id,
    );
    expect(messages.body).toMatchObject({ messages: [] });
  });

  it("journals failed turns without an assistant boundary and accepts the next prompt", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const host = await start(
      databasePath,
      join(root, "SpaceZero"),
      createScriptedConversationRunner({
        error: new AgentTurnError("agent_turn_failed"),
      }),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const failed = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "hello",
    );
    expect(failed.response.status).toBe(200);
    for (let attempt = 0; attempt < 50; attempt++) {
      if (
        eventTypes(databasePath, created.session.id).includes(
          "AgentTurnFailedV1",
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(eventTypes(databasePath, created.session.id)).toContain(
      "AgentTurnFailedV1",
    );
    const database = new DatabaseSync(databasePath);
    try {
      const event = database
        .prepare(
          "SELECT event_payload_json FROM chat_session_events WHERE event_type = 'AgentTurnFailedV1'",
        )
        .get() as { event_payload_json: string };
      expect(JSON.parse(event.event_payload_json)).toMatchObject({
        reason: "agent_turn_failed",
        failureCategory: "provider",
        retryable: false,
      });
      const turn = database
        .prepare(
          "SELECT failure_reason FROM chat_session_turns WHERE session_id = ?",
        )
        .get(created.session.id) as { failure_reason: string };
      expect(turn.failure_reason).toBe("agent_turn_failed");
    } finally {
      database.close();
    }
    const listed = await listMessages(
      host,
      client.clientCapability,
      created.session.id,
    );
    const messagesBody = listed.body as {
      messages: { role: string; text: string }[];
      latestTurn: {
        state: string;
        failureReason: string;
        failureCategory: string;
        retryable: boolean;
      };
    };
    expect(messagesBody.messages).toMatchObject([
      { role: "user", text: "hello" },
    ]);
    expect(messagesBody.latestTurn).toMatchObject({
      state: "failed",
      failureReason: "agent_turn_failed",
      failureCategory: "provider",
      retryable: false,
    });
  });

  it("rejects blank prompts, missing capabilities, and foreign origins", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );

    const blank = await submitPrompt(
      host,
      client.clientCapability,
      created.session.id,
      "   ",
    );
    expect(blank.response.status).toBe(400);

    const unauthorized = await fetch(
      new URL(
        `/v1/project-sessions/${created.session.id}/prompts`,
        host.endpoint,
      ),
      {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ commandId: randomUUID(), prompt: "hello" }),
      },
    );
    expect(unauthorized.status).toBe(401);

    const foreignOrigin = await fetch(
      new URL(
        `/v1/project-sessions/${created.session.id}/prompts`,
        host.endpoint,
      ),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client.clientCapability}`,
          Origin: "http://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ commandId: randomUUID(), prompt: "hello" }),
      },
    );
    expect(foreignOrigin.status).toBe(403);
  });
});
