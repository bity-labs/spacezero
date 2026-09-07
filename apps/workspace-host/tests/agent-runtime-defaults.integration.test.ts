import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AgentModelDescriptor,
  HostConnectionDescriptor,
} from "@spacezero/host-contracts";
import type { PiModelCatalogService } from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";

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
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    providerId: "anthropic",
    providerDisplayName: "Anthropic",
    modelId: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    authenticated: true,
    available: true,
    reasoningSupported: false,
    supportedThinkingLevels: ["off"],
  },
  {
    providerId: "anthropic",
    providerDisplayName: "Anthropic",
    modelId: "claude-offline-model",
    displayName: "Claude Offline Model",
    authenticated: true,
    available: false,
    reasoningSupported: true,
    supportedThinkingLevels: ["off", "high"],
  },
];

const modelCatalog: PiModelCatalogService = {
  listModels: async () => catalogModels,
  validateSelection: async () => undefined,
};

const hosts: StartedHostServer[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop()));
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-agent-runtime-defaults-"));
  dirs.push(dir);
  return dir;
};

const start = async (root: string) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath: join(root, "host.sqlite"),
    harnessAuthDirectory: join(root, "private-host-data", "harness-auth"),
    spaceZeroHome: join(root, "SpaceZero"),
    modelCatalog,
  });
  hosts.push(host);
  const descriptor = host.capabilities.mintClient(
    host.capabilities.issueSupervisor(),
  );
  return { host, descriptor };
};

const headers = (
  descriptor: HostConnectionDescriptor,
  requestOrigin = origin,
) => ({
  Authorization: `Bearer ${descriptor.clientCapability}`,
  Origin: requestOrigin,
  "Content-Type": "application/json",
});

const getDefaults = async (descriptor: HostConnectionDescriptor) => {
  const response = await fetch(
    new URL("/v1/agent-runtime/defaults", descriptor.endpoint),
    { headers: headers(descriptor) },
  );
  return { status: response.status, body: await response.json() };
};

const updateDefaults = async (
  descriptor: HostConnectionDescriptor,
  payload: unknown,
  requestOrigin = origin,
) => {
  const response = await fetch(
    new URL("/v1/agent-runtime/defaults", descriptor.endpoint),
    {
      method: "PUT",
      headers: headers(descriptor, requestOrigin),
      body: JSON.stringify(payload),
    },
  );
  return { status: response.status, body: await response.json() };
};

const querySql = <A>(databasePath: string, sql: string) => {
  const db = new DatabaseSync(databasePath);
  try {
    return db.prepare(sql).all() as A[];
  } finally {
    db.close();
  }
};

interface DefaultsResponseBody {
  readonly defaults: {
    readonly defaultModel: { readonly providerId: string; readonly modelId: string } | null;
    readonly defaultThinkingLevel: string | null;
  };
}

describe("Agent Runtime Host-global defaults", () => {
  it("returns no default model and no standalone default thinking on a fresh Host", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const { status, body } = await getDefaults(descriptor);
    expect(status).toBe(200);
    expect(body).toEqual({
      defaults: { defaultModel: null, defaultThinkingLevel: null },
    });
  });

  it("persists updated defaults across a Host restart outside the Session Event Journal", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const first = await start(root);

    const eventsBefore = querySql<{ count: number }>(
      databasePath,
      "SELECT COUNT(*) AS count FROM chat_session_events",
    );

    const updated = await updateDefaults(first.descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "high",
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({
      defaults: {
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
        defaultThinkingLevel: "high",
      },
    });

    const rows = querySql<{
      default_provider_id: string;
      default_model_id: string;
      default_thinking_level: string;
    }>(
      databasePath,
      "SELECT default_provider_id, default_model_id, default_thinking_level FROM agent_runtime_defaults WHERE singleton = 1",
    );
    expect(rows).toEqual([
      {
        default_provider_id: "anthropic",
        default_model_id: "claude-sonnet-4-5",
        default_thinking_level: "high",
      },
    ]);

    await first.host.stop();
    hosts.splice(
      hosts.findIndex((candidate) => candidate === first.host),
      1,
    );
    const restarted = await start(root);
    const { status, body } = await getDefaults(restarted.descriptor);
    expect(status).toBe(200);
    expect(body).toEqual({
      defaults: {
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
        defaultThinkingLevel: "high",
      },
    });

    const eventsAfter = querySql<{ count: number }>(
      databasePath,
      "SELECT COUNT(*) AS count FROM chat_session_events",
    );
    expect(eventsAfter).toEqual(eventsBefore);
  });

  it("validates the default model against the sanitized catalog", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const notFound = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "missing-model" },
    });
    expect(notFound.status).toBe(422);
    expect(notFound.body).toMatchObject({ code: "model_not_found" });

    const unavailable = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-offline-model" },
    });
    expect(unavailable.status).toBe(422);
    expect(unavailable.body).toMatchObject({ code: "model_unavailable" });

    const { body } = await getDefaults(descriptor);
    expect(body).toEqual({
      defaults: { defaultModel: null, defaultThinkingLevel: null },
    });
  });

  it("validates default thinking against the selected model's supported levels", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const seeded = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "high",
    });
    expect(seeded.status).toBe(200);

    const unsupported = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
      defaultThinkingLevel: "high",
    });
    expect(unsupported.status).toBe(422);
    expect(unsupported.body).toMatchObject({
      code: "thinking_level_unsupported",
    });

    const standalone = await updateDefaults(descriptor, {
      defaultThinkingLevel: "max",
    });
    expect(standalone.status).toBe(422);
    expect(standalone.body).toMatchObject({
      code: "thinking_level_unsupported",
    });
  });

  it("requires a default model before a default thinking level", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const response = await updateDefaults(descriptor, {
      defaultThinkingLevel: "high",
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: "default_model_required" });
  });

  it("falls back to the first supported thinking level when a model change invalidates the current level", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const seeded = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "high",
    });
    expect(seeded.status).toBe(200);

    const changed = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({
      defaults: {
        defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
        defaultThinkingLevel: "off",
      },
    });
  });

  it("chooses the first supported thinking level when selecting the first default model", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const changed = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
    });

    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({
      defaults: {
        defaultModel: { providerId: "anthropic", modelId: "claude-haiku-4-5" },
        defaultThinkingLevel: "off",
      },
    });
  });

  it("returns client-safe defaults payloads only", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const updated = await updateDefaults(descriptor, {
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "medium",
    });
    expect(updated.status).toBe(200);
    const body = updated.body as DefaultsResponseBody;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("/private-host-data/");
    expect(Object.keys(body.defaults)).toEqual([
      "defaultModel",
      "defaultThinkingLevel",
    ]);
    expect(Object.keys(body.defaults.defaultModel!)).toEqual([
      "providerId",
      "modelId",
    ]);
  });

  it("requires the renderer origin and authorization for defaults", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const wrongOrigin = await updateDefaults(
      descriptor,
      { defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" } },
      "spacezero://attacker",
    );
    expect(wrongOrigin.status).toBe(403);

    const unauthenticated = await fetch(
      new URL("/v1/agent-runtime/defaults", descriptor.endpoint),
      {
        method: "PUT",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(unauthenticated.status).toBe(401);
  });
});
