import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
      expect(seenTools).toEqual([{ kind: "none", enabledToolNames: [] }]);
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
});
