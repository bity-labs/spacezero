import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AgentRuntimeEvent,
  AgentReadOnlyInspectionTool,
  AgentTurnInput,
  ConversationRunner,
} from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";
import { seedAgentRuntimeDefaults } from "./agent-runtime-defaults.helpers.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-global-chat-tools-"));
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
  await run("git", ["add", "."], repo);
  await run("git", ["commit", "-q", "-m", "initial", "--allow-empty"], repo);
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
  seedAgentRuntimeDefaults(databasePath, {
    providerId: "anthropic",
    modelId: "claude-sonnet-4-5",
    defaultThinkingLevel: "low",
  });
  hosts.push(host);
  return host;
};
const descriptor = (host: StartedHostServer) =>
  host.capabilities.mintClient(host.capabilities.issueSupervisor())
    .clientCapability;
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
  return (await response.json()) as {
    project: { id: string; displayName: string; canonicalPath: string };
  };
};
const createGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
  firstPrompt: string,
) => {
  const response = await fetch(
    new URL("/v1/global-chat-sessions", host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId: randomUUID(), firstPrompt }),
    },
  );
  return { response, body: (await response.json()) as unknown };
};
const submitGlobalChatPrompt = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
  prompt: string,
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/prompts`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId: randomUUID(), prompt }),
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
const archiveGlobalChatSession = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/archive`, host.endpoint),
    {
      method: "POST",
      headers: authHeaders(clientCapability),
      body: JSON.stringify({ commandId: randomUUID() }),
    },
  );
  return { response, body: (await response.json()) as unknown };
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
  const deadline = Date.now() + 4_000;
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

interface ToolCallMessagePart {
  readonly type: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: string;
  readonly safety?: string;
  readonly approvalStatus?: string;
  readonly approvalReason?: string;
}

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("Global Chat read-only inspection Workspace Tools", () => {
  it("configures exactly the approved read-only inspection tools and runs them through the Host", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const seenTools: unknown[] = [];
    const runner: ConversationRunner = {
      submitTurn: async (input: AgentTurnInput) => {
        seenTools.push(input.tools);
        if (input.tools.kind !== "readOnlyInspection")
          throw new Error("expected readOnlyInspection tool configuration");
        const statusTool = input.tools.tools.find(
          (tool) => tool.name === "workspace.getStatus",
        );
        if (!statusTool) throw new Error("missing workspace.getStatus");
        const executed = (await statusTool.execute({})) as Record<
          string,
          unknown
        >;
        return {
          text: `status: ${JSON.stringify(executed)}`,
          parts: [
            { type: "text" as const, order: 1, text: "tool-assisted answer" },
          ],
        };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const clientCapability = descriptor(host);
    const project = await registerProject(
      host,
      clientCapability,
      await realpath(repo),
    );

    const created = await createGlobalChatSession(
      host,
      clientCapability,
      "what is the workspace status?",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;

    await waitFor(() => {
      expect(seenTools).toHaveLength(1);
    });
    const configuration = seenTools[0] as {
      readonly kind: string;
      readonly tools: readonly { readonly name: string }[];
    };
    expect(configuration.kind).toBe("readOnlyInspection");
    expect(configuration.tools.map((tool) => tool.name)).toEqual([
      "workspace.getStatus",
      "projects.listSummaries",
      "globalChats.listSummaries",
      "agentRuntime.getDefaults",
    ]);

    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        clientCapability,
        sessionId,
      );
      const messages = (
        listed.body as {
          messages: { role: string; text: string }[];
        }
      ).messages;
      expect(messages.at(-1)?.role).toBe("assistant");
      expect(messages.at(-1)?.text).toContain('"hostConnected":true');
      expect(messages.at(-1)?.text).toContain('"projectCount":1');
    });
    // The registered Project is only counted; paths never reach the chat.
    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        clientCapability,
        sessionId,
      );
      const assistant = (
        listed.body as {
          messages: { role: string; text: string }[];
        }
      ).messages.at(-1);
      expect(assistant?.text).not.toContain(project.project.canonicalPath);
      expect(JSON.stringify(listed.body)).not.toContain(
        project.project.canonicalPath,
      );
    });
  });

  it("records summarized durable tool activity for allowed and denied calls", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: async (input: AgentTurnInput) => {
        await input.onEvent?.({
          type: "tool_started",
          toolCallId: "call-1",
          toolName: "workspace.getStatus",
          arguments: { unexpected: "input" },
        } satisfies AgentRuntimeEvent);
        await input.onEvent?.({
          type: "tool_completed",
          toolCallId: "call-1",
          toolName: "workspace.getStatus",
          isError: false,
          result: {
            content: [{ type: "text", text: "raw tool output body" }],
          },
        } satisfies AgentRuntimeEvent);
        await input.onEvent?.({
          type: "tool_started",
          toolCallId: "call-2",
          toolName: "write",
          arguments: { path: "src/app.ts" },
        } satisfies AgentRuntimeEvent);
        await input.onEvent?.({
          type: "tool_denied",
          toolCallId: "call-2",
          toolName: "write",
          reason: "Tool is not enabled for this Chat Session",
        } satisfies AgentRuntimeEvent);
        await input.onEvent?.({
          type: "tool_completed",
          toolCallId: "call-2",
          toolName: "write",
          isError: true,
        } satisfies AgentRuntimeEvent);
        return { text: "tool answer" };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const clientCapability = descriptor(host);
    const created = await createGlobalChatSession(
      host,
      clientCapability,
      "inspect the workspace",
    );
    const sessionId = (created.body as { session: { id: string } }).session.id;

    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        clientCapability,
        sessionId,
      );
      const assistant = (
        listed.body as {
          messages: {
            role: string;
            parts?: readonly ToolCallMessagePart[];
          }[];
        }
      ).messages.find((message) => message.role === "assistant");
      const toolParts = (assistant?.parts ?? []).filter(
        (part) => part.type === "tool-call",
      );
      expect(toolParts.map((part) => part.toolName)).toEqual([
        "workspace.getStatus",
        "write",
      ]);
      expect(toolParts[0]).toMatchObject({
        status: "succeeded",
        safety: "read",
        approvalStatus: "approved",
        approvalReason: "approved_by_default",
      });
      expect(toolParts[1]).toMatchObject({
        status: "failed",
        approvalStatus: "requires_approval",
        approvalReason: "tool_denied_for_global_chat",
      });
      expect(toolParts[1]?.safety).toBeUndefined();
    });

    // Agent Activity History keeps minimal metadata only.
    const activities = readRows<{
      session_id: string;
      tool_call_id: string;
      turn_id: string;
      tool_name: string;
      safety: string;
      outcome: string;
      summary: string;
      timestamp: string;
    }>(
      databasePath,
      "SELECT * FROM agent_activity_history WHERE session_id = ? ORDER BY timestamp ASC",
      sessionId,
    );
    expect(activities.map((row) => [row.tool_name, row.outcome])).toEqual([
      ["workspace.getStatus", "succeeded"],
      ["write", "denied"],
    ]);
    expect(activities[0]).toMatchObject({
      session_id: sessionId,
      safety: "read",
    });
    expect(activities[1]?.safety).toBeNull();
    expect(activities[0]?.summary.length).toBeGreaterThan(0);
    expect(activities[0]?.summary.length).toBeLessThanOrEqual(256);
    expect(activities[0]?.turn_id.length).toBeGreaterThan(0);
    const columns = readRows<{ name: string; pk: number }>(
      databasePath,
      "SELECT name, pk FROM pragma_table_info('agent_activity_history')",
    );
    expect(columns.map((column) => column.name).sort()).toEqual([
      "outcome",
      "safety",
      "session_id",
      "summary",
      "timestamp",
      "tool_call_id",
      "tool_name",
      "turn_id",
    ]);
    expect(JSON.stringify(activities)).not.toContain("unexpected");
    expect(JSON.stringify(activities)).not.toContain("raw tool output body");
    expect(JSON.stringify(activities)).not.toContain("src/app.ts");
  });

  it("returns sanitized summaries for projects, global chats, and agent runtime defaults", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const runner: ConversationRunner = {
      submitTurn: async (input: AgentTurnInput) => {
        if (input.tools.kind !== "readOnlyInspection")
          throw new Error("expected readOnlyInspection tool configuration");
        const readOnlyTools =
          input.tools.kind === "readOnlyInspection" ? input.tools.tools : [];
        const tool = (name: string): AgentReadOnlyInspectionTool | undefined =>
          readOnlyTools.find((candidate) => candidate.name === name);
        const projects = (await tool("projects.listSummaries")!.execute(
          {},
        )) as { projects: Record<string, unknown>[] };
        const chats = (await tool("globalChats.listSummaries")!.execute(
          {},
        )) as { sessions: Record<string, unknown>[] };
        const archivedChats = (await tool("globalChats.listSummaries")!.execute(
          { includeArchived: true },
        )) as {
          sessions: Record<string, unknown>[];
        };
        const defaults = (await tool("agentRuntime.getDefaults")!.execute(
          {},
        )) as Record<string, unknown>;
        return {
          text: "done",
          parts: [
            {
              type: "text" as const,
              order: 1,
              text: JSON.stringify({
                projects,
                chats,
                archivedChats,
                defaults,
              }),
            },
          ],
        };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const clientCapability = descriptor(host);
    const project = await registerProject(
      host,
      clientCapability,
      await realpath(repo),
    );
    const first = await createGlobalChatSession(
      host,
      clientCapability,
      "first chat",
    );
    const second = await createGlobalChatSession(
      host,
      clientCapability,
      "second chat",
    );
    const secondSessionId = (second.body as { session: { id: string } }).session
      .id;
    const firstSessionId = (first.body as { session: { id: string } }).session
      .id;
    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        clientCapability,
        secondSessionId,
      );
      expect(
        (listed.body as { messages: { role: string }[] }).messages.at(-1)?.role,
      ).toBe("assistant");
    });
    // Archive the first chat, then run another turn in the second chat so the
    // tool snapshots see one unarchived and one archived Global Chat.
    await archiveGlobalChatSession(host, clientCapability, firstSessionId);
    await submitGlobalChatPrompt(
      host,
      clientCapability,
      secondSessionId,
      "summarize again",
    );

    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        clientCapability,
        secondSessionId,
      );
      expect(
        (listed.body as { messages: { role: string }[] }).messages.filter(
          (message) => message.role === "assistant",
        ),
      ).toHaveLength(2);
    });
    const listed = await listGlobalChatMessages(
      host,
      clientCapability,
      secondSessionId,
    );
    const assistant = (
      listed.body as {
        messages: {
          role: string;
          text: string;
          parts?: { type: string; text: string }[];
        }[];
      }
    ).messages
      .filter((message) => message.role === "assistant")
      .at(-1);
    const reportText =
      assistant?.parts?.find((part) => part.type === "text")?.text ??
      assistant?.text ??
      "{}";
    const report = JSON.parse(reportText) as {
      projects: { projects: Record<string, unknown>[] };
      chats: { sessions: Record<string, unknown>[] };
      archivedChats: { sessions: Record<string, unknown>[] };
      defaults: Record<string, unknown>;
    };

    expect(report.projects.projects).toEqual([
      { id: project.project.id, displayName: project.project.displayName },
    ]);
    expect(JSON.stringify(report.projects.projects)).not.toContain(
      project.project.canonicalPath,
    );

    expect(report.chats.sessions).toHaveLength(1);
    expect(report.chats.sessions[0]).toMatchObject({
      title: "second chat",
      archived: false,
    });
    expect(report.archivedChats.sessions).toHaveLength(2);
    expect(
      report.archivedChats.sessions.map((session) => session.archived),
    ).toContain(true);
    for (const session of report.archivedChats.sessions)
      expect(Object.keys(session).sort()).toEqual([
        "archived",
        "createdAt",
        "id",
        "title",
        "updatedAt",
      ]);

    expect(Object.keys(report.defaults).sort()).toEqual([
      "defaultThinkingLevel",
      "modelId",
      "modelName",
      "modelSupportsThinking",
      "providerId",
      "providerName",
    ]);
    expect(report.defaults).toMatchObject({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "low",
      modelSupportsThinking: expect.any(Boolean),
    });
    expect(JSON.stringify(report.defaults)).not.toMatch(
      /api|key|token|auth|header/i,
    );
  });

  it("counts unarchived Global Chats and active sessions in workspace status", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    let turnCount = 0;
    const runner: ConversationRunner = {
      submitTurn: async (input: AgentTurnInput) => {
        turnCount += 1;
        if (input.tools.kind !== "readOnlyInspection")
          throw new Error("expected readOnlyInspection tool configuration");
        // Block while the first turn is still running so the snapshot has an
        // active session; release control once a second prompt is submitted.
        if (turnCount === 1) {
          const statusTool = input.tools.tools.find(
            (tool) => tool.name === "workspace.getStatus",
          )!;
          const executed = (await statusTool.execute({})) as {
            unarchivedGlobalChatCount: number;
          };
          await new Promise((resolve) => setTimeout(resolve, 150));
          return {
            text: `count: ${executed.unarchivedGlobalChatCount}`,
            parts: [
              {
                type: "text" as const,
                order: 1,
                text: `count: ${executed.unarchivedGlobalChatCount}`,
              },
            ],
          };
        }
        return { text: "second answer" };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const clientCapability = descriptor(host);
    const first = await createGlobalChatSession(
      host,
      clientCapability,
      "first chat",
    );
    const firstSessionId = (first.body as { session: { id: string } }).session
      .id;
    const second = await createGlobalChatSession(
      host,
      clientCapability,
      "second chat",
    );

    await waitFor(async () => {
      const listed = await listGlobalChatMessages(
        host,
        clientCapability,
        firstSessionId,
      );
      const assistant = (
        listed.body as {
          messages: { role: string; text: string }[];
        }
      ).messages.at(-1);
      expect(assistant?.text).toContain("count: 2");
    });
    expect(second.response.status).toBe(200);
  });
});
