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
) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath,
    spaceZeroHome,
    ...(conversationRunner ? { conversationRunner } : {}),
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
const eventTypes = (databasePath: string, sessionId: string): string[] => {
  const db = new DatabaseSync(databasePath);
  try {
    const rows = db
      .prepare(
        "SELECT event_type FROM project_session_events WHERE session_id = ? ORDER BY sequence ASC",
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
      agentMessage: {
        id: string;
        role: string;
        text: string;
        sequence: number;
      };
    };
    expect(body.session.id).toBe(sessionId);
    expect(body.session.state).toBe("ready");
    expect(body.userMessage.role).toBe("user");
    expect(body.userMessage.text).toBe("Build the wine list view");
    expect(body.agentMessage.role).toBe("assistant");
    expect(body.agentMessage.text).toBe("Echo: Build the wine list view");
    expect(body.agentMessage.sequence).toBe(body.userMessage.sequence + 2);
    expect(seen).toHaveLength(1);
    const canonicalHome = await realpath(join(root, "SpaceZero"));
    expect(seen[0]?.worktreePath).toBe(
      join(canonicalHome, "worktrees", project.project.id, sessionId),
    );
    expect(eventTypes(databasePath, sessionId)).toEqual([
      "ProjectSessionCreationRequestedV1",
      "SessionWorkspacePreparationStartedV1",
      "SessionWorkspacePreparedV1",
      "ProjectSessionReadyV1",
      "UserMessageSubmittedV1",
      "AgentTurnStartedV1",
      "AgentMessageCompletedV1",
    ]);

    const listed = await listMessages(host, client.clientCapability, sessionId);
    expect(listed.response.status).toBe(200);
    const messagesBody = listed.body as {
      session: { id: string; lastSequence: number };
      messages: { id: string; role: string; text: string }[];
    };
    expect(messagesBody.session.id).toBe(sessionId);
    expect(messagesBody.messages).toMatchObject([
      {
        id: body.userMessage.id,
        role: "user",
        text: "Build the wine list view",
      },
      {
        id: body.agentMessage.id,
        role: "assistant",
        text: "Echo: Build the wine list view",
      },
    ]);
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
    expect(replayed.body).toMatchObject(first.body as object);
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "command_id_conflict" });
  });

  it("serializes concurrent prompts for one Session", async () => {
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

    const [first, second] = await Promise.all([
      submitPrompt(host, client.clientCapability, created.session.id, "one"),
      submitPrompt(host, client.clientCapability, created.session.id, "two"),
    ]);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    const listed = await listMessages(
      host,
      client.clientCapability,
      created.session.id,
    );
    const messagesBody = listed.body as {
      messages: { role: string; text: string }[];
    };
    const messagePairs = [
      messagesBody.messages.slice(0, 2),
      messagesBody.messages.slice(2, 4),
    ];
    expect(messagePairs).toHaveLength(2);
    expect(
      messagePairs.map((pair) => pair.map((message) => message.role)),
    ).toEqual([
      ["user", "assistant"],
      ["user", "assistant"],
    ]);
    expect(
      messagePairs.map((pair) => pair.map((message) => message.text)),
    ).toEqual(
      expect.arrayContaining([
        ["one", "Echo: one"],
        ["two", "Echo: two"],
      ]),
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
    db.prepare("UPDATE project_sessions SET state = 'recovery_required'").run();
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
    expect(failed.response.status).toBe(502);
    expect(failed.body).toMatchObject({
      code: "agent_turn_failed",
      message: "The agent turn failed. Try the prompt again.",
    });
    expect(eventTypes(databasePath, created.session.id)).toContain(
      "AgentTurnFailedV1",
    );
    const listed = await listMessages(
      host,
      client.clientCapability,
      created.session.id,
    );
    const messagesBody = listed.body as {
      messages: { role: string; text: string }[];
    };
    expect(messagesBody.messages).toMatchObject([
      { role: "user", text: "hello" },
    ]);
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
