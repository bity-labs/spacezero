import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type {
  AgentModelDescriptor,
  HostConnectionDescriptor,
} from "@spacezero/host-contracts";
import type { ConversationRunner, PiModelCatalogService } from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const catalogModels: readonly AgentModelDescriptor[] = [
  {
    providerId: "anthropic",
    providerDisplayName: "Anthropic",
    modelId: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    authenticated: true,
    available: true,
    reasoningSupported: true,
    supportedThinkingLevels: ["off", "medium", "high"],
  },
  {
    providerId: "anthropic",
    providerDisplayName: "Anthropic",
    modelId: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    authenticated: true,
    available: true,
    reasoningSupported: true,
    supportedThinkingLevels: ["off", "low"],
  },
];

const modelCatalog: PiModelCatalogService = {
  listModels: async () => catalogModels,
  validateSelection: async () => undefined,
};

const conversationRunner: ConversationRunner = {
  submitTurn: async () => ({ text: "Seeded answer" }),
};

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-session-runtime-seed-"));
  temps.push(dir);
  return dir;
};
const start = async (root: string) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath: join(root, "host.sqlite"),
    spaceZeroHome: join(root, "SpaceZero"),
    modelCatalog,
    conversationRunner,
  });
  hosts.push(host);
  const descriptor = host.capabilities.mintClient(
    host.capabilities.issueSupervisor(),
  );
  return { host, descriptor };
};
const authHeaders = (clientCapability: string) => ({
  Authorization: `Bearer ${clientCapability}`,
  Origin: origin,
  "Content-Type": "application/json",
});
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
const updateDefaults = async (
  descriptor: HostConnectionDescriptor,
  payload: unknown,
) => {
  const response = await fetch(
    new URL("/v1/agent-runtime/defaults", descriptor.endpoint),
    {
      method: "PUT",
      headers: authHeaders(descriptor.clientCapability),
      body: JSON.stringify(payload),
    },
  );
  return { response, body: (await response.json()) as unknown };
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
  commandId = randomUUID(),
) => {
  const response = await fetch(new URL("/v1/project-sessions", host.endpoint), {
    method: "POST",
    headers: authHeaders(clientCapability),
    body: JSON.stringify({ commandId, projectId }),
  });
  return { response, body: (await response.json()) as unknown };
};
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
const getProjectSessionRuntime = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/project-sessions/${sessionId}/runtime`, host.endpoint),
    { headers: authHeaders(clientCapability) },
  );
  return { response, body: (await response.json()) as unknown };
};
const updateProjectSessionRuntime = async (
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
  return { response, body: (await response.json()) as unknown };
};
const getGlobalChatSessionRuntime = async (
  host: StartedHostServer,
  clientCapability: string,
  sessionId: string,
) => {
  const response = await fetch(
    new URL(`/v1/global-chat-sessions/${sessionId}/runtime`, host.endpoint),
    { headers: authHeaders(clientCapability) },
  );
  return { response, body: (await response.json()) as unknown };
};
const listProjectSessions = async (
  host: StartedHostServer,
  clientCapability: string,
) => {
  const response = await fetch(new URL("/v1/project-sessions", host.endpoint), {
    headers: authHeaders(clientCapability),
  });
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
const expectRuntime = (
  body: unknown,
  runtime: {
    readonly providerId: string;
    readonly modelId: string;
    readonly defaultThinkingLevel: string;
    readonly revision: number;
  },
) => expect(body).toMatchObject({ runtime });

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("Session creation seeds runtime from Host-global defaults", () => {
  it("seeds new Project Session runtime configuration from Host-global defaults", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const { host, descriptor } = await start(root);

    const seeded = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
      defaultThinkingLevel: "low",
    });
    expect(seeded.response.status).toBe(200);

    const project = await registerProject(
      host,
      descriptor.clientCapability,
      repo,
    );
    const created = await createProjectSession(
      host,
      descriptor.clientCapability,
      project.project.id,
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;

    const runtime = await getProjectSessionRuntime(
      host,
      descriptor.clientCapability,
      sessionId,
    );
    expect(runtime.response.status).toBe(200);
    expectRuntime(runtime.body, {
      providerId: "anthropic",
      modelId: "claude-haiku-4-5",
      defaultThinkingLevel: "low",
      revision: 1,
    });
  });

  it("seeds new Global Chat Session runtime configuration from the same Host-global defaults", async () => {
    const root = await temp();
    const { host, descriptor } = await start(root);

    const seeded = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
      defaultThinkingLevel: "low",
    });
    expect(seeded.response.status).toBe(200);

    const created = await createGlobalChatSession(
      host,
      descriptor.clientCapability,
      "Hello from the seeded defaults",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (
      created.body as { session: { id: string } }
    ).session.id;

    const runtime = await getGlobalChatSessionRuntime(
      host,
      descriptor.clientCapability,
      sessionId,
    );
    expect(runtime.response.status).toBe(200);
    expectRuntime(runtime.body, {
      providerId: "anthropic",
      modelId: "claude-haiku-4-5",
      defaultThinkingLevel: "low",
      revision: 1,
    });
  });

  it("keeps per-session runtime overrides independent after Session creation", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const { host, descriptor } = await start(root);

    const seeded = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
      defaultThinkingLevel: "low",
    });
    expect(seeded.response.status).toBe(200);

    const project = await registerProject(
      host,
      descriptor.clientCapability,
      repo,
    );
    const created = await createProjectSession(
      host,
      descriptor.clientCapability,
      project.project.id,
    );
    expect(created.response.status).toBe(200);
    const sessionId = (created.body as { session: { id: string } }).session.id;

    const overridden = await updateProjectSessionRuntime(
      host,
      descriptor.clientCapability,
      sessionId,
      {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        defaultThinkingLevel: "high",
        expectedRevision: 1,
      },
    );
    expect(overridden.response.status).toBe(200);
    expectRuntime(overridden.body, {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "high",
      revision: 2,
    });

    const defaultsChanged = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
      defaultThinkingLevel: "off",
    });
    expect(defaultsChanged.response.status).toBe(200);

    const runtime = await getProjectSessionRuntime(
      host,
      descriptor.clientCapability,
      sessionId,
    );
    expect(runtime.response.status).toBe(200);
    expectRuntime(runtime.body, {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "high",
      revision: 2,
    });

    const globalChat = await createGlobalChatSession(
      host,
      descriptor.clientCapability,
      "Should seed the updated defaults",
    );
    expect(globalChat.response.status).toBe(200);
    const globalRuntime = await getGlobalChatSessionRuntime(
      host,
      descriptor.clientCapability,
      (globalChat.body as { session: { id: string } }).session.id,
    );
    expect(globalRuntime.response.status).toBe(200);
    expectRuntime(globalRuntime.body, {
      providerId: "anthropic",
      modelId: "claude-haiku-4-5",
      defaultThinkingLevel: "off",
      revision: 1,
    });
  });

  it("keeps per-session Global Chat runtime overrides independent after creation", async () => {
    const root = await temp();
    const { host, descriptor } = await start(root);

    const seeded = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
      defaultThinkingLevel: "low",
    });
    expect(seeded.response.status).toBe(200);

    const created = await createGlobalChatSession(
      host,
      descriptor.clientCapability,
      "Override this runtime",
    );
    expect(created.response.status).toBe(200);
    const sessionId = (
      created.body as { session: { id: string } }
    ).session.id;

    // Wait for the first prompt turn to finish before reconfiguring runtime.
    await waitFor(() => {
      const turns = readRows<{ state: string }>(
        join(root, "host.sqlite"),
        "SELECT state FROM chat_session_turns WHERE session_id = ?",
        sessionId,
      );
      expect(turns.length).toBeGreaterThan(0);
      expect(turns[0]?.state).toBe("completed");
    });

    const overridden = await fetch(
      new URL(`/v1/global-chat-sessions/${sessionId}/runtime`, host.endpoint),
      {
        method: "PUT",
        headers: authHeaders(descriptor.clientCapability),
        body: JSON.stringify({
          commandId: randomUUID(),
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          defaultThinkingLevel: "high",
          expectedRevision: 1,
        }),
      },
    );
    expect(overridden.status).toBe(200);
    expectRuntime((await overridden.json()) as unknown, {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "high",
      revision: 2,
    });

    const defaultsChanged = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "medium",
    });
    expect(defaultsChanged.response.status).toBe(200);

    const runtime = await getGlobalChatSessionRuntime(
      host,
      descriptor.clientCapability,
      sessionId,
    );
    expect(runtime.response.status).toBe(200);
    expectRuntime(runtime.body, {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "high",
      revision: 2,
    });
  });

  it("fails Project Session creation with a client-safe error when no default model exists", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const { host, descriptor } = await start(root);

    const project = await registerProject(
      host,
      descriptor.clientCapability,
      repo,
    );
    const created = await createProjectSession(
      host,
      descriptor.clientCapability,
      project.project.id,
    );
    expect(created.response.status).toBe(409);
    expect(created.body).toMatchObject({
      code: "agent_default_model_missing",
      message: expect.stringContaining("No default agent model"),
    });

    const listed = await listProjectSessions(
      host,
      descriptor.clientCapability,
    );
    expect(listed.response.status).toBe(200);
    expect(listed.body).toEqual({ sessions: [] });
  });

  it("fails Global Chat Session creation with a client-safe error when no default model exists", async () => {
    const root = await temp();
    const { host, descriptor } = await start(root);

    const created = await createGlobalChatSession(
      host,
      descriptor.clientCapability,
      "Nobody to run this prompt",
    );
    expect(created.response.status).toBe(409);
    expect(created.body).toMatchObject({
      code: "agent_default_model_missing",
      message: expect.stringContaining("No default agent model"),
    });
  });
});
