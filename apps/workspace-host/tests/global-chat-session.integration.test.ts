import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AgentTurnError, type ConversationRunner } from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";
import { seedAgentRuntimeDefaults } from "./agent-runtime-defaults.helpers.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-global-chat-session-"));
  temps.push(dir);
  return dir;
};
const start = async (
  databasePath: string,
  spaceZeroHome: string,
  conversationRunner?: ConversationRunner,
) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath,
    spaceZeroHome,
    ...(conversationRunner === undefined ? {} : { conversationRunner }),
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
const createGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
  firstPrompt: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL("/v1/global-chat-sessions", host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId, firstPrompt }),
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
const cancelGlobalChatFollowUp = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  followUpId: string,
) => {
  const response = await fetch(
    new URL(
      `/v1/global-chat-sessions/${sessionId}/follow-ups/${followUpId}/cancel`,
      host.endpoint,
    ),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: "{}",
    },
  );
  return { response, body: (await response.json()) as unknown };
};
const archiveGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/archive`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId }),
    },
  );
  return { response, body: (await response.json()) as unknown };
};
const unarchiveGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/unarchive`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId }),
    },
  );
  return { response, body: (await response.json()) as unknown };
};
const renameGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  title: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/rename`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId, title }),
    },
  );
  return { response, body: (await response.json()) as unknown };
};
const listGlobalChatSessions = async (
  host: StartedHostServer,
  clientCapability: string,
) => {
  const response = await fetch(
    new URL("/v1/global-chat-sessions", host.endpoint),
    { headers: authHeaders(clientCapability) },
  );
  return { response, body: (await response.json()) as unknown };
};
const interruptGlobalChatTurn = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  turnId: string,
) => {
  const response = await fetch(
    new URL(
      `/v1/global-chat-sessions/${sessionId}/turns/${turnId}/interrupt`,
      host.endpoint,
    ),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: "{}",
    },
  );
  return { response, body: (await response.json()) as unknown };
};
const subscribeGlobalChatSessionEvents = (
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

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("Global Chat Session Host protocol", () => {
  it("preserves provider-exposed reasoning parts through Global Chat history and reload", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "assistant_delta",
          part: { type: "reasoning", order: 1, text: "Think globally." },
        });
        await input.onEvent?.({
          type: "assistant_delta",
          part: { type: "text", order: 2, text: "Global answer." },
        });
        return {
          text: "Global answer.",
          parts: [
            { type: "reasoning", order: 1, text: "Think globally." },
            { type: "text", order: 2, text: "Global answer." },
          ],
        };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);

    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "global reasoning",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;
    let retainedMessages: {
      id: string;
      role: string;
      text: string;
      parts?: { id: string; type: string; order: number; text: string }[];
    }[] = [];
    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        client.clientCapability,
        sessionId,
      );
      const body = listed.body as { messages: typeof retainedMessages };
      const assistant = body.messages.find(
        (message) => message.role === "assistant",
      );
      expect(assistant?.parts).toMatchObject([
        {
          id: `${assistant?.id}:reasoning:1`,
          type: "reasoning",
          order: 1,
          text: "Think globally.",
        },
        {
          id: `${assistant?.id}:text:2`,
          type: "text",
          order: 2,
          text: "Global answer.",
        },
      ]);
      expect(JSON.stringify(listed.body)).not.toContain("thinkingSignature");
      retainedMessages = body.messages;
    });

    await host.stop();
    hosts = hosts.filter((candidate) => candidate !== host);
    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      runner,
    );
    const reloaded = await listGlobalChatMessages(
      restarted,
      descriptor(restarted).clientCapability,
      sessionId,
    );
    expect(reloaded.body).toMatchObject({ messages: retainedMessages });
  });

  it("keeps delayed reasoning-before-text checkpoints schema-valid through Global Chat SSE and reload", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    let release!: () => void;
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "assistant_delta",
          part: { type: "reasoning", order: 1, text: "Think before text." },
        });
        await releasePromise;
        await input.onEvent?.({
          type: "assistant_delta",
          part: { type: "text", order: 2, text: "Final global answer." },
        });
        return {
          text: "Final global answer.",
          parts: [
            { type: "reasoning", order: 1, text: "Think before text." },
            { type: "text", order: 2, text: "Final global answer." },
          ],
        };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);

    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "delayed reasoning checkpoint",
    );
    expect(created.response.status).toBe(200);
    const session = (
      created.body as {
        session: { id: string; lastSequence: number };
      }
    ).session;
    await waitFor(() => {
      expect(
        readRows<{ count: number }>(
          databasePath,
          "SELECT count(*) AS count FROM chat_session_events WHERE session_id = ? AND event_type = 'GlobalChatAgentMessageCheckpointedV1'",
          session.id,
        )[0]?.count,
      ).toBe(1);
    });
    const events = await subscribeGlobalChatSessionEvents(
      host,
      client.clientCapability,
      session.id,
      session.lastSequence,
    );
    expect(events.status).toBe(200);

    const frames = await Promise.race([
      readSseFrames(events, 1),
      new Promise<readonly { data: unknown }[]>((resolve) =>
        setTimeout(() => resolve([]), 2_000),
      ),
    ]);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ event: "global-chat-session.event" });
    expect(frames[0]?.data).toMatchObject({
      event: {
        type: "GlobalChatAgentMessageCheckpointedV1",
        text: "",
        parts: [{ type: "reasoning", text: "Think before text." }],
      },
    });

    const listed = await listGlobalChatMessages(
      host,
      client.clientCapability,
      session.id,
    );
    expect(listed.body).toMatchObject({
      activeTurn: {
        draftText: "",
        draftParts: [{ type: "reasoning", text: "Think before text." }],
      },
    });

    release();
    let retainedMessages: {
      id: string;
      role: string;
      text: string;
      parts?: { id: string; type: string; order: number; text: string }[];
    }[] = [];
    await waitFor(async () => {
      const completed = await listGlobalChatMessages(
        host,
        client.clientCapability,
        session.id,
      );
      const body = completed.body as { messages: typeof retainedMessages };
      const assistant = body.messages.find(
        (message) => message.role === "assistant",
      );
      expect(assistant?.parts).toMatchObject([
        { type: "reasoning", text: "Think before text." },
        { type: "text", text: "Final global answer." },
      ]);
      retainedMessages = body.messages;
    });

    await host.stop();
    hosts = hosts.filter((candidate) => candidate !== host);
    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      runner,
    );
    const reloaded = await listGlobalChatMessages(
      restarted,
      descriptor(restarted).clientCapability,
      session.id,
    );
    expect(reloaded.body).toMatchObject({ messages: retainedMessages });
    const replayed = await subscribeGlobalChatSessionEvents(
      restarted,
      descriptor(restarted).clientCapability,
      session.id,
      session.lastSequence,
    );
    expect(replayed.status).toBe(200);
    const replayedFrames = await readSseFrames(replayed, 1);
    expect(replayedFrames[0]?.data).toMatchObject({
      event: {
        type: "GlobalChatAgentMessageCheckpointedV1",
        text: "",
        parts: [{ type: "reasoning", text: "Think before text." }],
      },
    });
  });

  it("creates a durable unarchived Global Chat Session from the first prompt and starts a tool-less Pi turn", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    let providerCalls = 0;
    const seenTools: unknown[] = [];
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        providerCalls += 1;
        seenTools.push(input.tools);
        return { text: "Global answer" };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);

    const createCommandId = randomUUID();
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      `  ${"Release plan ".repeat(8)}\nsecond line is ignored`,
      createCommandId,
    );

    expect(created.response.status).toBe(200);
    const body = created.body as {
      session: Record<string, unknown>;
      firstMessage: Record<string, unknown>;
      turn: Record<string, unknown>;
      userMessage: Record<string, unknown>;
    };
    expect(body.session).toMatchObject({
      title: "Release plan Release plan Release plan Release plan Release ",
      archived: false,
      lastSequence: 4,
    });
    expect(body.session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.session).not.toHaveProperty("projectId");
    expect(body.session).not.toHaveProperty("worktreePath");
    expect(body.session).not.toHaveProperty("managedBranch");
    expect(body.session).not.toHaveProperty("sourceCommit");
    expect(body.firstMessage).toMatchObject({
      role: "user",
      text: `${"Release plan ".repeat(8)}\nsecond line is ignored`,
      sequence: 3,
      commandId: createCommandId,
    });
    expect(body.userMessage).toEqual(body.firstMessage);
    expect(body.turn).toMatchObject({ state: "running" });
    await waitFor(() => {
      expect(providerCalls).toBe(1);
      expect(
        (seenTools as { kind: string }[]).map((tools) => tools.kind),
      ).toEqual(["readOnlyInspection"]);
      expect(
        readRows<{ role: string; text: string; sequence: number }>(
          databasePath,
          "SELECT role, text, sequence FROM chat_session_messages WHERE session_id = ? ORDER BY sequence ASC",
          body.session.id as string,
        ),
      ).toEqual([
        {
          role: "user",
          text: body.firstMessage.text as string,
          sequence: 3,
        },
        {
          role: "assistant",
          text: "Global answer",
          sequence: 5,
        },
      ]);
    });

    const sessions = readRows<{
      session_id: string;
      title: string;
      archived_at: string | null;
      last_sequence: number;
    }>(
      databasePath,
      "SELECT session_id, title, archived_at, last_sequence FROM chat_sessions WHERE kind = 'global'",
    );
    expect(sessions).toEqual([
      {
        session_id: body.session.id as string,
        title: body.session.title as string,
        archived_at: null,
        last_sequence: 5,
      },
    ]);
    const sessionColumns = readRows<{ name: string }>(
      databasePath,
      "PRAGMA table_info(chat_sessions)",
    ).map((row) => row.name);
    expect(sessionColumns).not.toContain("project_id");
    expect(sessionColumns).not.toContain("worktree_path");
    expect(sessionColumns).not.toContain("managed_branch");
    expect(sessionColumns).not.toContain("source_commit");
    expect(
      readRows<{ count: number }>(
        databasePath,
        "SELECT count(*) AS count FROM project_session_bindings WHERE session_id = ?",
        body.session.id as string,
      )[0]?.count,
    ).toBe(0);
    expect(
      readRows<{ event_type: string; sequence: number }>(
        databasePath,
        "SELECT event_type, sequence FROM chat_session_events WHERE session_id = ? ORDER BY sequence ASC",
        body.session.id as string,
      ),
    ).toEqual([
      { event_type: "GlobalChatSessionCreatedV1", sequence: 1 },
      { event_type: "GlobalChatSessionRuntimeConfiguredV1", sequence: 2 },
      { event_type: "GlobalChatUserMessageSubmittedV1", sequence: 3 },
      { event_type: "GlobalChatAgentTurnStartedV1", sequence: 4 },
      { event_type: "GlobalChatAgentMessageCompletedV1", sequence: 5 },
    ]);

    const listed = await listGlobalChatMessages(
      host,
      client.clientCapability,
      body.session.id as string,
    );
    expect(listed.response.status).toBe(200);
    expect(listed.body).toMatchObject({
      messages: [
        {
          id: body.userMessage.id,
          role: "user",
          text: body.userMessage.text,
          commandId: createCommandId,
        },
        {
          role: "assistant",
          text: "Global answer",
          commandId: createCommandId,
        },
      ],
    });
  });

  it("appends a later prompt to the same Global Chat Session and reloads its history without project identity", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    let providerCalls = 0;
    const seenPrompts: string[] = [];
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        providerCalls += 1;
        seenPrompts.push(input.prompt);
        return {
          text: providerCalls === 1 ? "Global answer" : "Global second answer",
        };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);

    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "First global prompt",
    );
    expect(created.response.status).toBe(200);
    const { session } = created.body as {
      session: { id: string; updatedAt: string; lastSequence: number };
    };
    await waitFor(() => expect(providerCalls).toBe(1));

    const before = await listGlobalChatMessages(
      host,
      client.clientCapability,
      session.id,
    );
    expect(before.response.status).toBe(200);
    const beforeBody = before.body as {
      session: { id: string; updatedAt: string; lastSequence: number };
    };
    expect(beforeBody.session).toMatchObject({
      id: session.id,
      lastSequence: 5,
    });

    const submitCommandId = randomUUID();
    const submitted = await submitGlobalChatPrompt(
      host,
      client.clientCapability,
      session.id,
      "Second global prompt",
      submitCommandId,
    );
    expect(submitted.response.status).toBe(200);
    const submittedBody = submitted.body as {
      session: {
        id: string;
        updatedAt: string;
        lastSequence: number;
        [key: string]: unknown;
      };
      userMessage: { id: string; text: string; commandId: string };
      turn: { id: string; state: string; commandId: string };
    };
    expect(submittedBody.session.id).toBe(session.id);
    expect(submittedBody.session.lastSequence).toBe(7);
    expect(submittedBody.userMessage).toMatchObject({
      role: "user",
      text: "Second global prompt",
      commandId: submitCommandId,
      sequence: 6,
    });
    expect(submittedBody.turn).toMatchObject({
      state: "running",
      commandId: submitCommandId,
    });
    for (const record of [
      submittedBody.session,
      submittedBody.userMessage,
      submittedBody.turn,
    ]) {
      expect(record).not.toHaveProperty("projectId");
      expect(record).not.toHaveProperty("worktreePath");
      expect(record).not.toHaveProperty("managedBranch");
      expect(record).not.toHaveProperty("sourceBranch");
      expect(record).not.toHaveProperty("sourceCommit");
    }

    await waitFor(() => expect(providerCalls).toBe(2));
    expect(seenPrompts).toEqual([
      "First global prompt",
      "Second global prompt",
    ]);

    const after = await listGlobalChatMessages(
      host,
      client.clientCapability,
      session.id,
    );
    const afterBody = after.body as {
      session: { id: string; updatedAt: string; lastSequence: number };
      messages: { role: string; text: string; sequence: number }[];
    };
    expect(afterBody.session.id).toBe(session.id);
    expect(afterBody.session.lastSequence).toBe(8);
    expect(
      new Date(afterBody.session.updatedAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(beforeBody.session.updatedAt).getTime());
    expect(
      afterBody.messages.map((message) => [message.role, message.text]),
    ).toEqual([
      ["user", "First global prompt"],
      ["assistant", "Global answer"],
      ["user", "Second global prompt"],
      ["assistant", "Global second answer"],
    ]);

    expect(
      readRows<{ event_type: string; sequence: number }>(
        databasePath,
        "SELECT event_type, sequence FROM chat_session_events WHERE session_id = ? AND sequence > ? ORDER BY sequence ASC",
        session.id,
        beforeBody.session.lastSequence,
      ),
    ).toEqual([
      { event_type: "GlobalChatUserMessageSubmittedV1", sequence: 6 },
      { event_type: "GlobalChatAgentTurnStartedV1", sequence: 7 },
      { event_type: "GlobalChatAgentMessageCompletedV1", sequence: 8 },
    ]);

    // Cursor replay over the existing SSE subscription path delivers the
    // appended events from the durable journal.
    const replayed = await subscribeGlobalChatSessionEvents(
      host,
      client.clientCapability,
      session.id,
      beforeBody.session.lastSequence,
    );
    expect(replayed.status).toBe(200);
    const replayFrames = await readSseFrames(replayed, 3);
    expect(
      replayFrames.map(
        (frame) => (frame.data as { event: { type: string } }).event.type,
      ),
    ).toEqual([
      "GlobalChatUserMessageSubmittedV1",
      "GlobalChatAgentTurnStartedV1",
      "GlobalChatAgentMessageCompletedV1",
    ]);

    const replaySubmit = await submitGlobalChatPrompt(
      host,
      client.clientCapability,
      session.id,
      "Second global prompt",
      submitCommandId,
    );
    expect(replaySubmit.response.status).toBe(200);
    const replayBody = replaySubmit.body as typeof submittedBody;
    expect(replayBody.turn.id).toBe(submittedBody.turn.id);
    expect(replayBody.userMessage.id).toBe(submittedBody.userMessage.id);
    expect(providerCalls).toBe(2);
  });

  it("queues, cancels, consumes, reloads, authorizes, and isolates Global Chat follow-ups", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    let releaseFirst!: () => void;
    const firstTurnReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const submittedPrompts: string[] = [];
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        submittedPrompts.push(input.prompt);
        if (input.prompt === "initial prompt") await firstTurnReleased;
        return { text: `answer: ${input.prompt}` };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "initial prompt",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;

    const unauthenticated = await fetch(
      new URL(
        `/v1/global-chat-sessions/${sessionId}/follow-ups`,
        host.endpoint,
      ),
      { headers: { Origin: origin } },
    );
    expect(unauthenticated.status).toBe(401);

    const firstCommandId = randomUUID();
    const secondCommandId = randomUUID();
    const first = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      "same text follow-up",
      firstCommandId,
    );
    const replayed = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      "same text follow-up",
      firstCommandId,
    );
    const conflict = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      "different prompt",
      firstCommandId,
    );
    const second = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      "same text follow-up",
      secondCommandId,
    );

    expect(first.response.status).toBe(200);
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject(first.body as object);
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "command_id_conflict" });
    expect(second.response.status).toBe(200);
    expect(first.body).toMatchObject({
      followUp: {
        commandId: firstCommandId,
        prompt: "same text follow-up",
        position: 1,
        state: "queued",
      },
    });
    expect(second.body).toMatchObject({
      followUp: { commandId: secondCommandId, position: 2, state: "queued" },
    });
    const subscribed = await subscribeGlobalChatSessionEvents(
      host,
      client.clientCapability,
      sessionId,
      4,
    );
    expect(subscribed.status).toBe(200);
    const queueFrames = await readSseFrames(subscribed, 2);
    expect(queueFrames.map((frame) => frame.data)).toMatchObject([
      {
        event: {
          type: "GlobalChatSessionFollowUpQueuedV1",
          commandId: firstCommandId,
        },
      },
      {
        event: {
          type: "GlobalChatSessionFollowUpQueuedV1",
          commandId: secondCommandId,
        },
      },
    ]);

    const secondFollowUpId = (second.body as { followUp: { id: string } })
      .followUp.id;
    const cancelled = await cancelGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      secondFollowUpId,
    );
    expect(cancelled.response.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      followUp: { commandId: secondCommandId, state: "cancelled" },
    });

    const queued = await listGlobalChatFollowUps(
      host,
      client.clientCapability,
      sessionId,
    );
    expect(queued.response.status).toBe(200);
    expect(queued.body).toMatchObject({
      followUps: [
        { commandId: firstCommandId, state: "queued", position: 1 },
        { commandId: secondCommandId, state: "cancelled", position: 2 },
      ],
    });
    expect(
      readRows<{ count: number }>(
        databasePath,
        "SELECT count(*) AS count FROM project_session_bindings WHERE session_id = ?",
        sessionId,
      )[0]?.count,
    ).toBe(0);
    expect(
      readRows<{ count: number }>(
        databasePath,
        "SELECT count(*) AS count FROM project_session_follow_ups WHERE session_id = ?",
        sessionId,
      )[0]?.count,
    ).toBe(0);

    releaseFirst();
    await waitFor(async () => {
      const listed = await listGlobalChatFollowUps(
        host,
        client.clientCapability,
        sessionId,
      );
      expect(listed.body).toMatchObject({
        followUps: [
          {
            commandId: firstCommandId,
            state: "consumed",
            dispatchedTurnId: expect.any(String),
          },
          { commandId: secondCommandId, state: "cancelled" },
        ],
      });
    });
    await waitFor(() => {
      expect(submittedPrompts).toEqual([
        "initial prompt",
        "same text follow-up",
      ]);
    });
    expect(
      readRows<{ event_type: string }>(
        databasePath,
        "SELECT event_type FROM chat_session_events WHERE session_id = ? ORDER BY sequence ASC",
        sessionId,
      ).map((row) => row.event_type),
    ).toEqual(
      expect.arrayContaining([
        "GlobalChatSessionFollowUpQueuedV1",
        "GlobalChatSessionFollowUpCancelledV1",
        "GlobalChatSessionFollowUpDispatchedV1",
        "GlobalChatSessionFollowUpConsumedV1",
      ]),
    );

    await host.stop();
    hosts = hosts.filter((candidate) => candidate !== host);
    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      runner,
    );
    const reloaded = await listGlobalChatFollowUps(
      restarted,
      descriptor(restarted).clientCapability,
      sessionId,
    );
    expect(reloaded.body).toMatchObject({
      followUps: [
        { commandId: firstCommandId, state: "consumed" },
        { commandId: secondCommandId, state: "cancelled" },
      ],
    });
  });

  it("interrupts only the current Global Chat turn and drains the next queued follow-up", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const submittedPrompts: string[] = [];
    let partialEmitted!: () => void;
    const partialEmittedPromise = new Promise<void>((resolve) => {
      partialEmitted = resolve;
    });
    let nextStarted!: () => void;
    const nextStartedPromise = new Promise<void>((resolve) => {
      nextStarted = resolve;
    });
    let releaseNext!: () => void;
    const releaseNextPromise = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        submittedPrompts.push(input.prompt);
        if (input.prompt === "active prompt") {
          await input.onEvent?.({
            type: "assistant_delta",
            part: { type: "text", order: 1, text: "partial global" },
          });
          partialEmitted();
          await new Promise<never>((_, reject) => {
            if (input.signal?.aborted)
              reject(new AgentTurnError("agent_turn_interrupted"));
            input.signal?.addEventListener(
              "abort",
              () => reject(new AgentTurnError("agent_turn_interrupted")),
              { once: true },
            );
          });
        }
        nextStarted();
        await releaseNextPromise;
        return { text: "queued global answer" };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "active prompt",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;
    const firstTurnId = (created.body as { turn: { id: string } }).turn.id;
    const followUpCommandId = randomUUID();
    const queued = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      "queued prompt",
      followUpCommandId,
    );
    expect(queued.response.status).toBe(200);
    await partialEmittedPromise;

    const interrupted = await interruptGlobalChatTurn(
      host,
      client.clientCapability,
      sessionId,
      firstTurnId,
    );

    expect(interrupted.response.status).toBe(200);
    expect(interrupted.body).toMatchObject({
      turn: {
        id: firstTurnId,
        state: "interrupted",
        draftText: "partial global",
      },
    });
    await nextStartedPromise;
    const stale = await interruptGlobalChatTurn(
      host,
      client.clientCapability,
      sessionId,
      firstTurnId,
    );
    expect(stale.response.status).toBe(200);
    expect(stale.body).toMatchObject({
      turn: { id: firstTurnId, state: "interrupted" },
    });
    const listedWhileNextRuns = await listGlobalChatMessages(
      host,
      client.clientCapability,
      sessionId,
    );
    expect(listedWhileNextRuns.body).toMatchObject({
      latestTurn: {
        id: expect.not.stringMatching(firstTurnId),
        state: "running",
      },
      activeTurn: { state: "running" },
      messages: [
        { role: "user", text: "active prompt" },
        { role: "user", text: "queued prompt", commandId: followUpCommandId },
      ],
    });
    const followUps = await listGlobalChatFollowUps(
      host,
      client.clientCapability,
      sessionId,
    );
    expect(followUps.body).toMatchObject({
      followUps: [
        {
          commandId: followUpCommandId,
          state: "consumed",
          dispatchedTurnId: expect.any(String),
        },
      ],
    });
    expect(submittedPrompts).toEqual(["active prompt", "queued prompt"]);

    releaseNext();
    await waitFor(async () => {
      const completed = await listGlobalChatMessages(
        host,
        client.clientCapability,
        sessionId,
      );
      expect(completed.body).toMatchObject({
        latestTurn: { state: "completed" },
      });
    });
  });

  it("keeps queued Global Chat follow-ups paused after restart recovery marks an active turn", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const submittedPrompts: string[] = [];
    let markFirstTurnStarted!: () => void;
    const firstTurnStarted = new Promise<void>((resolve) => {
      markFirstTurnStarted = resolve;
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        submittedPrompts.push(input.prompt);
        if (input.prompt === "initial prompt") {
          markFirstTurnStarted();
          await new Promise<void>(() => undefined);
        }
        return { text: `answer: ${input.prompt}` };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const initialCommandId = randomUUID();
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "initial prompt",
      initialCommandId,
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;
    await firstTurnStarted;

    const followUpCommandId = randomUUID();
    const queued = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      "queued after crash",
      followUpCommandId,
    );
    expect(queued.response.status).toBe(200);
    expect(queued.body).toMatchObject({
      followUp: { commandId: followUpCommandId, state: "queued" },
    });

    await new Promise<void>((resolve, reject) => {
      host.server.close((error) => (error ? reject(error) : resolve()));
    });
    hosts = hosts.filter((candidate) => candidate !== host);

    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      runner,
    );
    const restartedClient = descriptor(restarted);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const listed = await listGlobalChatFollowUps(
      restarted,
      restartedClient.clientCapability,
      sessionId,
    );
    expect(listed.response.status).toBe(200);
    expect(listed.body).toMatchObject({
      followUps: [{ commandId: followUpCommandId, state: "queued" }],
    });
    expect(
      readRows<{ command_id: string; state: string }>(
        databasePath,
        "SELECT command_id, state FROM chat_session_turns WHERE session_id = ? ORDER BY created_at ASC",
        sessionId,
      ),
    ).toEqual([{ command_id: initialCommandId, state: "recovery_required" }]);
    expect(
      readRows<{ event_type: string }>(
        databasePath,
        "SELECT event_type FROM chat_session_events WHERE session_id = ? ORDER BY sequence ASC",
        sessionId,
      ).map((row) => row.event_type),
    ).not.toContain("GlobalChatSessionFollowUpDispatchedV1");

    const blocked = await submitGlobalChatPrompt(
      restarted,
      restartedClient.clientCapability,
      sessionId,
      "manual prompt must wait for recovery",
    );
    expect(blocked.response.status).toBe(409);
    expect(blocked.body).toMatchObject({
      code: "global_chat_session_turn_in_progress",
    });
    expect(submittedPrompts).toEqual(["initial prompt"]);
  });

  it("retains Global Chat tool activity with no-output failures across reload", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "tool_started",
          toolCallId: "global-tool-1",
          toolName: "workspace.inspect",
          arguments: { target: "app-shell" },
        });
        await input.onEvent?.({
          type: "tool_updated",
          toolCallId: "global-tool-1",
          toolName: "workspace.inspect",
          summary: "Inspecting workspace",
        });
        await input.onEvent?.({
          type: "tool_completed",
          toolCallId: "global-tool-1",
          toolName: "workspace.inspect",
          isError: true,
          result: { content: [] },
        });
        return { text: "Could not inspect." };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "inspect globally",
    );
    const session = (created.body as { session: { id: string } }).session;
    let retainedMessages: { role: string; parts?: unknown[] }[] = [];
    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        client.clientCapability,
        session.id,
      );
      retainedMessages = (
        listed.body as { messages: { role: string; parts?: unknown[] }[] }
      ).messages;
      expect(retainedMessages).toHaveLength(2);
    });

    expect(retainedMessages[1]).toMatchObject({
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          toolCallId: "global-tool-1",
          toolName: "workspace.inspect",
          status: "failed",
          arguments: { target: "app-shell" },
          result: { content: [] },
        },
        { type: "text", text: "Could not inspect." },
      ],
    });
    await host.stop();
    hosts = hosts.filter((candidate) => candidate !== host);
    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      runner,
    );
    const reloaded = await listGlobalChatMessages(
      restarted,
      descriptor(restarted).clientCapability,
      session.id,
    );
    expect(reloaded.body).toMatchObject({ messages: retainedMessages });
  });

  it("retains Global Chat safe image tool results and explicit fallbacks across reload", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "tool_started",
          toolCallId: "global-image-tool-1",
          toolName: "workspace.inspect",
          arguments: { target: "image-result" },
        });
        await input.onEvent?.({
          type: "tool_completed",
          toolCallId: "global-image-tool-1",
          toolName: "workspace.inspect",
          isError: false,
          result: {
            content: [
              { type: "image", mimeType: "image/webp", data: "UklGRg==" },
              {
                type: "unsupported",
                label: "Unsupported tool result content type: html.",
              },
            ],
          },
        });
        return { text: "Rendered safe rich content." };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "inspect rich content",
    );
    const session = (created.body as { session: { id: string } }).session;
    let retainedMessages: { role: string; parts?: unknown[] }[] = [];
    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        client.clientCapability,
        session.id,
      );
      retainedMessages = (
        listed.body as { messages: { role: string; parts?: unknown[] }[] }
      ).messages;
      expect(retainedMessages).toHaveLength(2);
    });

    expect(retainedMessages[1]).toMatchObject({
      role: "assistant",
      parts: [
        {
          type: "tool-call",
          toolCallId: "global-image-tool-1",
          toolName: "workspace.inspect",
          status: "succeeded",
          result: {
            content: [
              { type: "image", mimeType: "image/webp", data: "UklGRg==" },
              {
                type: "unsupported",
                label: "Unsupported tool result content type: html.",
              },
            ],
          },
        },
        { type: "text", text: "Rendered safe rich content." },
      ],
    });
    await host.stop();
    hosts = hosts.filter((candidate) => candidate !== host);
    const restarted = await start(
      databasePath,
      join(root, "SpaceZero"),
      runner,
    );
    const reloaded = await listGlobalChatMessages(
      restarted,
      descriptor(restarted).clientCapability,
      session.id,
    );
    expect(reloaded.body).toMatchObject({ messages: retainedMessages });
  });

  it("replays duplicate create commands with the same input and rejects command ID conflicts", async () => {
    const root = await temp();
    const runner: ConversationRunner = {
      submitTurn: async () => ({ text: "planned" }),
    };
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      runner,
    );
    const client = descriptor(host);
    const commandId = randomUUID();

    const first = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Plan agent capabilities",
      commandId,
    );
    const replayed = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Plan agent capabilities",
      commandId,
    );
    const conflict = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Plan something else",
      commandId,
    );

    expect(first.response.status).toBe(200);
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      session: { id: (first.body as { session: { id: string } }).session.id },
      firstMessage: {
        text: "Plan agent capabilities",
        role: "user",
      },
    });
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "command_id_conflict" });
  });

  it("archives and unarchives a completed Global Chat Session with durable events, projections, and receipts", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath, join(root, "SpaceZero"), {
      submitTurn: async () => ({ text: "Global answer" }),
    });
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Archive me later",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;
    await waitFor(() => {
      expect(
        readRows<{ state: string }>(
          databasePath,
          "SELECT state FROM chat_session_turns WHERE session_id = ?",
          sessionId,
        )[0]?.state,
      ).toBe("completed");
    });

    const archiveCommandId = randomUUID();
    const archived = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      archiveCommandId,
    );
    expect(archived.response.status).toBe(200);
    expect(archived.body).toMatchObject({
      session: { id: sessionId, archived: true },
    });
    expect(
      (archived.body as { session: { archivedAt?: string } }).session
        .archivedAt,
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Idempotent replay of the same command and a fresh command against the
    // same state both succeed without appending another archive event.
    const replayed = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      archiveCommandId,
    );
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      session: { id: sessionId, archived: true },
    });
    const freshCommand = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
    );
    expect(freshCommand.response.status).toBe(200);
    expect(freshCommand.body).toMatchObject({
      session: { id: sessionId, archived: true },
    });
    expect(
      readRows<{ count: number }>(
        databasePath,
        "SELECT count(*) AS count FROM chat_session_events WHERE session_id = ? AND event_type = 'GlobalChatSessionArchivedV1'",
        sessionId,
      )[0]?.count,
    ).toBe(1);
    expect(
      readRows<{ archived_at: string | null }>(
        databasePath,
        "SELECT archived_at FROM chat_sessions WHERE session_id = ?",
        sessionId,
      )[0]?.archived_at,
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Archived sessions reject prompts and follow-ups with typed errors.
    const rejectedPrompt = await submitGlobalChatPrompt(
      host,
      client.clientCapability,
      sessionId,
      "ignored",
    );
    expect(rejectedPrompt.response.status).toBe(409);
    expect(rejectedPrompt.body).toMatchObject({
      code: "global_chat_session_archived",
    });
    const rejectedFollowUp = await enqueueGlobalChatFollowUp(
      host,
      client.clientCapability,
      sessionId,
      "ignored",
    );
    expect(rejectedFollowUp.response.status).toBe(409);
    expect(rejectedFollowUp.body).toMatchObject({
      code: "global_chat_session_archived",
    });

    // Archived sessions stay readable.
    const archivedMessages = await listGlobalChatMessages(
      host,
      client.clientCapability,
      sessionId,
    );
    expect(archivedMessages.response.status).toBe(200);
    expect(archivedMessages.body).toMatchObject({
      session: { id: sessionId, archived: true },
    });

    const listedWhileArchived = await listGlobalChatSessions(
      host,
      client.clientCapability,
    );
    expect(listedWhileArchived.body).toMatchObject({
      sessions: [{ id: sessionId, archived: true }],
    });

    const unarchiveCommandId = randomUUID();
    const unarchived = await unarchiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      unarchiveCommandId,
    );
    expect(unarchived.response.status).toBe(200);
    expect(unarchived.body).toMatchObject({
      session: { id: sessionId, archived: false },
    });
    expect(
      (unarchived.body as { session: { archivedAt?: string } }).session,
    ).not.toHaveProperty("archivedAt");
    expect(
      readRows<{ archived_at: string | null }>(
        databasePath,
        "SELECT archived_at FROM chat_sessions WHERE session_id = ?",
        sessionId,
      )[0]?.archived_at,
    ).toBeNull();
    expect(
      readRows<{ event_type: string; sequence: number }>(
        databasePath,
        "SELECT event_type, sequence FROM chat_session_events WHERE session_id = ? AND event_type IN ('GlobalChatSessionArchivedV1', 'GlobalChatSessionUnarchivedV1') ORDER BY sequence ASC",
        sessionId,
      ),
    ).toEqual([
      {
        event_type: "GlobalChatSessionArchivedV1",
        sequence: expect.any(Number),
      },
      {
        event_type: "GlobalChatSessionUnarchivedV1",
        sequence: expect.any(Number),
      },
    ]);

    // The unarchived session accepts prompts again.
    const resumed = await submitGlobalChatPrompt(
      host,
      client.clientCapability,
      sessionId,
      "Continue the conversation",
    );
    expect(resumed.response.status).toBe(200);
    expect(resumed.body).toMatchObject({
      session: { id: sessionId, archived: false },
      userMessage: { text: "Continue the conversation" },
    });
    const listedAfterUnarchive = await listGlobalChatSessions(
      host,
      client.clientCapability,
    );
    expect(listedAfterUnarchive.body).toMatchObject({
      sessions: [{ id: sessionId, archived: false }],
    });
  });

  it("rejects interrupting an archived Global Chat Session turn like Project Sessions", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath, join(root, "SpaceZero"), {
      submitTurn: async () => ({ text: "Global answer" }),
    });
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Interrupt me after archiving",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;
    const turnId = (created.body as { turn: { id: string } }).turn.id;
    await waitFor(() => {
      expect(
        readRows<{ state: string }>(
          databasePath,
          "SELECT state FROM chat_session_turns WHERE session_id = ?",
          sessionId,
        )[0]?.state,
      ).toBe("completed");
    });

    const archived = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
    );
    expect(archived.response.status).toBe(200);

    // Archived sessions cannot have an active turn because archiving is
    // rejected while a turn is in progress, so interruption is rejected with
    // the same typed error used for non-active turns, matching Project
    // Session interrupt semantics.
    const rejectedInterrupt = await interruptGlobalChatTurn(
      host,
      client.clientCapability,
      sessionId,
      turnId,
    );
    expect(rejectedInterrupt.response.status).toBe(409);
    expect(rejectedInterrupt.body).toMatchObject({
      code: "turn_not_active",
    });
  });

  it("rejects archiving a Global Chat Session while an agent turn is in progress", async () => {
    const root = await temp();
    let partialEmitted!: () => void;
    const partialEmittedPromise = new Promise<void>((resolve) => {
      partialEmitted = resolve;
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "assistant_delta",
          part: { type: "text", order: 1, text: "partial" },
        });
        partialEmitted();
        await new Promise<never>((_, reject) => {
          if (input.signal?.aborted)
            reject(new AgentTurnError("agent_turn_interrupted"));
          input.signal?.addEventListener(
            "abort",
            () => reject(new AgentTurnError("agent_turn_interrupted")),
            { once: true },
          );
        });
        return { text: "" };
      },
    };
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      runner,
    );
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "active prompt",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;
    await partialEmittedPromise;

    const archived = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
    );
    expect(archived.response.status).toBe(409);
    expect(archived.body).toMatchObject({
      code: "global_chat_session_turn_in_progress",
    });
    expect(
      readRows<{ archived_at: string | null }>(
        join(root, "host.sqlite"),
        "SELECT archived_at FROM chat_sessions WHERE session_id = ?",
        sessionId,
      )[0]?.archived_at,
    ).toBeNull();
  });

  it("rejects archive command ID conflicts and unknown sessions with typed public errors", async () => {
    const root = await temp();
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      { submitTurn: async () => ({ text: "answer" }) },
    );
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Archive conflict probe",
    );
    const sessionId = (created.body as { session: { id: string } }).session.id;
    await waitFor(() => {
      expect(
        readRows<{ state: string }>(
          join(root, "host.sqlite"),
          "SELECT state FROM chat_session_turns WHERE session_id = ?",
          sessionId,
        )[0]?.state,
      ).toBe("completed");
    });

    const conflictCommandId = randomUUID();
    const archived = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      conflictCommandId,
    );
    expect(archived.response.status).toBe(200);
    const reusedElsewhere = await unarchiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      conflictCommandId,
    );
    expect(reusedElsewhere.response.status).toBe(409);
    expect(reusedElsewhere.body).toMatchObject({ code: "command_id_conflict" });

    const missing = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      randomUUID(),
    );
    expect(missing.response.status).toBe(404);
    expect(missing.body).toMatchObject({
      code: "global_chat_session_not_found",
    });
  });

  it("renames a Global Chat Session with a durable event, projection update, and receipts", async () => {
    const root = await temp();
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      { submitTurn: async () => ({ text: "answer" }) },
    );
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Original title",
    );
    const sessionId = (created.body as { session: { id: string } }).session.id;
    await waitFor(() => {
      expect(
        readRows<{ state: string }>(
          join(root, "host.sqlite"),
          "SELECT state FROM chat_session_turns WHERE session_id = ?",
          sessionId,
        )[0]?.state,
      ).toBe("completed");
    });

    const renameCommandId = randomUUID();
    const renamed = await renameGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      "  Renamed through the Host  ",
      renameCommandId,
    );
    expect(renamed.response.status).toBe(200);
    expect(renamed.body).toMatchObject({
      session: { id: sessionId, title: "Renamed through the Host" },
    });

    // The rename is idempotent: the same command replays, and a fresh
    // command with the same trimmed title records a receipt without
    // appending another rename event.
    const replayed = await renameGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      "  Renamed through the Host  ",
      renameCommandId,
    );
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      session: { id: sessionId, title: "Renamed through the Host" },
    });
    const freshCommand = await renameGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      "Renamed through the Host",
    );
    expect(freshCommand.response.status).toBe(200);
    expect(freshCommand.body).toMatchObject({
      session: { id: sessionId, title: "Renamed through the Host" },
    });

    expect(
      readRows<{ count: number }>(
        join(root, "host.sqlite"),
        "SELECT count(*) AS count FROM chat_session_events WHERE session_id = ? AND event_type = 'GlobalChatSessionRenamedV1'",
        sessionId,
      )[0]?.count,
    ).toBe(1);
    expect(
      readRows<{ title: string }>(
        join(root, "host.sqlite"),
        "SELECT title FROM chat_sessions WHERE session_id = ?",
        sessionId,
      )[0]?.title,
    ).toBe("Renamed through the Host");

    // The list projection reflects the new title and sorts the renamed
    // session by its updated time.
    const listed = await listGlobalChatSessions(host, client.clientCapability);
    expect(listed.body).toMatchObject({
      sessions: [
        { id: sessionId, title: "Renamed through the Host", archived: false },
      ],
    });

    // Renamed titles survive a host restart through the projection.
    const restartedHost = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      { submitTurn: async () => ({ text: "answer" }) },
    );
    const reloaded = await listGlobalChatSessions(
      restartedHost,
      descriptor(restartedHost).clientCapability,
    );
    expect(reloaded.body).toMatchObject({
      sessions: [{ id: sessionId, title: "Renamed through the Host" }],
    });
  });

  it("rejects blank, multiline, and oversized rename titles with typed public errors", async () => {
    const root = await temp();
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      { submitTurn: async () => ({ text: "answer" }) },
    );
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Rename validation probe",
    );
    const sessionId = (created.body as { session: { id: string } }).session.id;
    await waitFor(() => {
      expect(
        readRows<{ state: string }>(
          join(root, "host.sqlite"),
          "SELECT state FROM chat_session_turns WHERE session_id = ?",
          sessionId,
        )[0]?.state,
      ).toBe("completed");
    });

    for (const title of [
      "",
      "   ",
      "first line\nsecond line",
      "x".repeat(61),
    ]) {
      const rejected = await renameGlobalChatSession(
        host,
        client.clientCapability,
        sessionId,
        title,
      );
      expect(rejected.response.status).toBe(400);
      expect(rejected.body).toMatchObject({
        code: "global_chat_session_title_invalid",
      });
    }
    // A rejected rename appends no events and leaves the projection alone.
    expect(
      readRows<{ count: number }>(
        join(root, "host.sqlite"),
        "SELECT count(*) AS count FROM chat_session_events WHERE session_id = ? AND event_type = 'GlobalChatSessionRenamedV1'",
        sessionId,
      )[0]?.count,
    ).toBe(0);
    expect(
      readRows<{ title: string }>(
        join(root, "host.sqlite"),
        "SELECT title FROM chat_sessions WHERE session_id = ?",
        sessionId,
      )[0]?.title,
    ).toBe("Rename validation probe");
  });

  it("renames an archived Global Chat Session and rejects rename command ID conflicts", async () => {
    const root = await temp();
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
      { submitTurn: async () => ({ text: "answer" }) },
    );
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Archive then rename me",
    );
    const sessionId = (created.body as { session: { id: string } }).session.id;
    await waitFor(() => {
      expect(
        readRows<{ state: string }>(
          join(root, "host.sqlite"),
          "SELECT state FROM chat_session_turns WHERE session_id = ?",
          sessionId,
        )[0]?.state,
      ).toBe("completed");
    });

    const archiveCommandId = randomUUID();
    const archived = await archiveGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      archiveCommandId,
    );
    expect(archived.response.status).toBe(200);
    expect(archived.body).toMatchObject({
      session: { id: sessionId, archived: true },
    });

    // Rename is metadata management and stays available while archived.
    const renamedWhileArchived = await renameGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      "Renamed while archived",
    );
    expect(renamedWhileArchived.response.status).toBe(200);
    expect(renamedWhileArchived.body).toMatchObject({
      session: {
        id: sessionId,
        title: "Renamed while archived",
        archived: true,
      },
    });
    expect(
      readRows<{ archived_at: string | null }>(
        join(root, "host.sqlite"),
        "SELECT archived_at FROM chat_sessions WHERE session_id = ?",
        sessionId,
      )[0]?.archived_at,
    ).not.toBeNull();
    expect(
      readRows<{ count: number }>(
        join(root, "host.sqlite"),
        "SELECT count(*) AS count FROM chat_session_events WHERE session_id = ? AND event_type = 'GlobalChatSessionRenamedV1'",
        sessionId,
      )[0]?.count,
    ).toBe(1);

    // Reusing a rename command ID with different input fails with a typed
    // conflict, and unknown sessions fail with a typed 404.
    const reusedCommandId = randomUUID();
    const firstUse = await renameGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      "Renamed once",
      reusedCommandId,
    );
    expect(firstUse.response.status).toBe(200);
    const reusedElsewhere = await renameGlobalChatSession(
      host,
      client.clientCapability,
      sessionId,
      "Renamed differently",
      reusedCommandId,
    );
    expect(reusedElsewhere.response.status).toBe(409);
    expect(reusedElsewhere.body).toMatchObject({ code: "command_id_conflict" });

    const missing = await renameGlobalChatSession(
      host,
      client.clientCapability,
      randomUUID(),
      "Renamed missing",
    );
    expect(missing.response.status).toBe(404);
    expect(missing.body).toMatchObject({
      code: "global_chat_session_not_found",
    });
  });

  it("lists only approved global skills for Global Chat sessions with sanitized descriptors", async () => {
    const root = await temp();
    const spaceZeroHome = join(root, "SpaceZero");
    const homeSkill = join(spaceZeroHome, "skills", "home-global");
    await mkdir(homeSkill, { recursive: true });
    // Project-local style roots colocated near Space Zero Home must never be
    // scanned because Global Chat has no Project identity or trust context.
    const decoys = [
      join(spaceZeroHome, ".agents", "skills", "home-agents-decoy"),
      join(spaceZeroHome, ".pi", "skills", "home-pi-decoy"),
    ];
    for (const [index, decoy] of decoys.entries()) {
      await mkdir(decoy, { recursive: true });
      await writeFile(
        join(decoy, "SKILL.md"),
        `---\nname: home-${index === 0 ? "agents" : "pi"}-decoy\ndescription: Decoy copy\n---\n\nDo the decoy thing.\n`,
      );
    }
    await writeFile(
      join(homeSkill, "SKILL.md"),
      "---\nname: home-global\ndescription: Approved global skill.\n---\n\nDo the thing.\n",
    );
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: async () => ({ text: "Global answer" }),
    };
    const host = await start(databasePath, spaceZeroHome, runner);
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "List skills",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;

    const response = await fetch(
      new URL(`/v1/global-chat-sessions/${sessionId}/skills`, host.endpoint),
      { headers: authHeaders(client.clientCapability) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      sessionId: string;
      skills: Record<string, unknown>[];
      diagnostics: unknown[];
    };
    expect(body.sessionId).toBe(sessionId);
    const names = body.skills.map((entry) => entry.name);
    expect(names).toContain("home-global");
    expect(names).not.toContain("home-agents-decoy");
    expect(names).not.toContain("home-pi-decoy");
    for (const entry of body.skills) {
      if (entry.name !== "home-global") continue;
      expect(entry).toMatchObject({
        name: "home-global",
        description: "Approved global skill.",
        scope: "spacezero_home",
        enabled: true,
        trusted: true,
      });
      expect(Object.keys(entry).sort()).toEqual([
        "description",
        "digest",
        "enabled",
        "name",
        "scope",
        "trusted",
      ]);
      expect(JSON.stringify(entry)).not.toContain("SKILL.md");
      expect(JSON.stringify(entry)).not.toContain(spaceZeroHome);
    }

    const missing = await fetch(
      new URL(`/v1/global-chat-sessions/${randomUUID()}/skills`, host.endpoint),
      { headers: authHeaders(client.clientCapability) },
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      code: "global_chat_session_not_found",
    });

    const unauthenticated = await fetch(
      new URL(`/v1/global-chat-sessions/${sessionId}/skills`, host.endpoint),
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("excludes disabled global skills from Global Chat listings and Pi Adapter turn resources", async () => {
    const root = await temp();
    const spaceZeroHome = join(root, "SpaceZero");
    const skillDir = join(spaceZeroHome, "skills", "turn-resource-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: turn-resource-skill\ndescription: Seeded for turn resources.\n---\n\nSkill body for Pi expansion.\n",
    );
    const disabledDir = join(spaceZeroHome, "skills", "disabled-skill");
    await mkdir(disabledDir, { recursive: true });
    await writeFile(
      join(disabledDir, "SKILL.md"),
      "---\nname: disabled-skill\ndescription: Disabled global skill.\n---\n\nShould never load.\n",
    );
    const databasePath = join(root, "host.sqlite");
    const seenResources: unknown[] = [];
    const seenTools: unknown[] = [];
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        seenResources.push(input.resources);
        seenTools.push(input.tools);
        return { text: "Global answer" };
      },
    };
    const host = await start(databasePath, spaceZeroHome, runner);
    const client = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Use a skill",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;

    const listing = (await (
      await fetch(
        new URL(`/v1/global-chat-sessions/${sessionId}/skills`, host.endpoint),
        { headers: authHeaders(client.clientCapability) },
      )
    ).json()) as { skills: { name: string }[] };
    expect(listing.skills.map((entry) => entry.name)).toContain(
      "turn-resource-skill",
    );

    const db = new DatabaseSync(databasePath);
    try {
      db.exec(
        "INSERT INTO skill_preferences (skill_name, enabled, updated_at) VALUES ('disabled-skill', 0, '2026-01-01T00:00:00.000Z')",
      );
    } finally {
      db.close();
    }

    // New and reloaded sessions run turns through fresh discovery, so the
    // disabled skill must be excluded without restarting the Host.
    await waitFor(() => {
      const resources = seenResources[0] as
        { skills?: { name: string; body: string }[] } | undefined;
      expect(resources?.skills?.map((entry) => entry.name)).toContain(
        "turn-resource-skill",
      );
      expect(
        resources?.skills?.find((entry) => entry.name === "turn-resource-skill")
          ?.body,
      ).toContain("Skill body for Pi expansion.");
    });
    expect(
      (seenTools as { kind: string }[]).map((tools) => tools.kind),
    ).toEqual(["readOnlyInspection"]);

    // Disabling a global skill must exclude it from new and reloaded turns.
    // Resources captured after the disable row is written must not include it.
    const seenBeforeDisable = seenResources.length;

    const submitted = await submitGlobalChatPrompt(
      host,
      client.clientCapability,
      sessionId,
      "Second turn",
    );
    expect(submitted.response.status).toBe(200);
    await waitFor(() => {
      expect(seenResources.length).toBeGreaterThan(seenBeforeDisable);
    });
    const afterListing = (await (
      await fetch(
        new URL(`/v1/global-chat-sessions/${sessionId}/skills`, host.endpoint),
        { headers: authHeaders(client.clientCapability) },
      )
    ).json()) as { skills: { name: string }[] };
    expect(afterListing.skills.map((entry) => entry.name)).not.toContain(
      "disabled-skill",
    );
    for (const resources of seenResources.slice(seenBeforeDisable) as {
      skills?: { name: string }[];
    }[]) {
      expect(resources.skills?.map((entry) => entry.name)).not.toContain(
        "disabled-skill",
      );
    }
  });
});
