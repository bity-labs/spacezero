import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import { parseFlowEventEnvelope } from "@spacezero/host-contracts";
import type {
  PiModelCatalogService,
  PiThinkingLevel,
  ProviderAuthService,
} from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
const hosts: StartedHostServer[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop()));
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-defaults-auth-sync-"));
  dirs.push(dir);
  return dir;
};

type ProviderAuthMethod = "api_key" | "oauth";

interface SyncFixture {
  readonly providerAuth: ProviderAuthService;
  readonly modelCatalog: PiModelCatalogService;
}

const catalogModel = (
  providerId: string,
  providerDisplayName: string,
  modelId: string,
  displayName: string,
  supportedThinkingLevels: readonly PiThinkingLevel[],
) => ({
  providerId,
  providerDisplayName,
  modelId,
  displayName,
  reasoningSupported: supportedThinkingLevels.length > 1,
  supportedThinkingLevels,
});

// Catalog ordering mirrors the Host/Pi catalog: providers and models are
// ordered by display name, so the first entry per provider is the first
// available model for that provider.
const catalog = (configured: ReadonlyMap<string, ProviderAuthMethod>) => [
  {
    ...catalogModel(
      "anthropic",
      "Anthropic",
      "claude-sonnet-4-5",
      "Claude Sonnet 4.5",
      ["off", "medium", "high"] as const,
    ),
    authenticated: configured.has("anthropic"),
    available: configured.has("anthropic"),
  },
  {
    ...catalogModel(
      "anthropic",
      "Anthropic",
      "claude-haiku-4-5",
      "Claude Haiku 4.5",
      ["off"] as const,
    ),
    authenticated: configured.has("anthropic"),
    available: configured.has("anthropic"),
  },
  {
    ...catalogModel(
      "google",
      "Google",
      "gemini-2-5-pro",
      "Gemini 2.5 Pro",
      ["off", "high"] as const,
    ),
    authenticated: configured.has("google"),
    available: configured.has("google"),
  },
  {
    ...catalogModel(
      "google",
      "Google",
      "gemini-2-5-flash",
      "Gemini 2.5 Flash",
      ["off"] as const,
    ),
    authenticated: configured.has("google"),
    available: configured.has("google"),
  },
];

const makeFixture = (
  configured: Map<string, ProviderAuthMethod> = new Map(),
): SyncFixture => {
  const methodFor = (providerId: string): ProviderAuthMethod | undefined =>
    configured.get(providerId);
  const option = (
    providerId: string,
    displayName: string,
    authMethods: readonly ProviderAuthMethod[],
  ) => {
    const configuredMethod = methodFor(providerId);
    return {
      providerId,
      displayName,
      authMethods,
      configured: configuredMethod !== undefined,
      ...(configuredMethod ? { configuredMethod } : {}),
    };
  };
  const providerAuth: ProviderAuthService = {
    listOptions: async () => [
      option("anthropic", "Anthropic", ["api_key", "oauth"]),
      option("google", "Google", ["oauth", "api_key"]),
    ],
    status: async (providerId) => ({
      providerId,
      configured: configured.has(providerId),
      source: configured.has(providerId) ? "stored" : "missing",
    }),
    setApiKey: async (providerId) => {
      configured.set(providerId, "api_key");
      return { providerId, configured: true, source: "stored" };
    },
    removeApiKey: async (providerId) => {
      configured.delete(providerId);
      return { providerId, configured: false, source: "missing" };
    },
    loginOAuth: async (providerId, interaction) => {
      interaction.notify({ type: "progress", message: "Starting sign-in" });
      const code = await interaction.prompt({
        type: "text",
        message: "Paste the authorization code",
        placeholder: "code",
      });
      if (code !== "oauth-secret-code") throw new Error("bad code");
      configured.set(providerId, "oauth");
      return { providerId, configured: true, source: "stored" };
    },
  };
  const modelCatalog: PiModelCatalogService = {
    listModels: async () => catalog(configured),
    validateSelection: async () => undefined,
  };
  return { providerAuth, modelCatalog };
};

const start = async (
  root: string,
  fixture?: SyncFixture,
): Promise<{ descriptor: HostConnectionDescriptor }> => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath: join(root, "host.sqlite"),
    harnessAuthDirectory: join(root, "private-host-data", "harness-auth"),
    spaceZeroHome: join(root, "SpaceZero"),
    ...(fixture?.providerAuth ? { providerAuth: fixture.providerAuth } : {}),
    ...(fixture?.modelCatalog ? { modelCatalog: fixture.modelCatalog } : {}),
  });
  hosts.push(host);
  const descriptor = host.capabilities.mintClient(
    host.capabilities.issueSupervisor(),
  );
  return { descriptor };
};

const headers = (descriptor: HostConnectionDescriptor) => ({
  Authorization: `Bearer ${descriptor.clientCapability}`,
  Origin: origin,
  "Content-Type": "application/json",
});

const getDefaults = async (descriptor: HostConnectionDescriptor) => {
  const response = await fetch(
    new URL("/v1/agent-runtime/defaults", descriptor.endpoint),
    { headers: headers(descriptor) },
  );
  return { status: response.status, body: await response.json() };
};

const setApiKey = async (
  descriptor: HostConnectionDescriptor,
  providerId: string,
  apiKey: string,
) => {
  const response = await fetch(
    new URL(`/v1/harness-auth/providers/${providerId}/api-key`, descriptor.endpoint),
    {
      method: "PUT",
      headers: headers(descriptor),
      body: JSON.stringify({ apiKey }),
    },
  );
  return { status: response.status, body: await response.json() };
};

const removeApiKey = async (
  descriptor: HostConnectionDescriptor,
  providerId: string,
) => {
  const response = await fetch(
    new URL(`/v1/harness-auth/providers/${providerId}/api-key`, descriptor.endpoint),
    { method: "DELETE", headers: headers(descriptor) },
  );
  return { status: response.status, body: await response.json() };
};

const readFlowEvents = async (
  response: Response,
  count: number,
): Promise<ReturnType<typeof parseFlowEventEnvelope>[]> => {
  if (!response.body) throw new Error("missing SSE body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const events: ReturnType<typeof parseFlowEventEnvelope>[] = [];
  while (events.length < count) {
    const read = await reader.read();
    if (read.done) break;
    buffered += decoder.decode(read.value, { stream: true });
    const parts = buffered.replaceAll("\r\n", "\n").split("\n\n");
    buffered = parts.pop() ?? "";
    for (const frame of parts) {
      if (!frame.includes("event: flow.event")) continue;
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      events.push(parseFlowEventEnvelope(JSON.parse(data) as unknown));
      if (events.length >= count) break;
    }
  }
  await reader.cancel().catch(() => undefined);
  return events;
};

const completeOAuthFlow = async (
  descriptor: HostConnectionDescriptor,
  providerId: string,
) => {
  const started = await fetch(
    new URL(`/v1/harness-auth/providers/${providerId}/oauth-flows`, descriptor.endpoint),
    { method: "POST", headers: headers(descriptor) },
  );
  expect(started.status).toBe(200);
  const { flowId } = (await started.json()) as { flowId: string };
  const stream = await fetch(
    new URL(`/v1/flows/${flowId}/events?after=0`, descriptor.endpoint),
    { headers: headers(descriptor) },
  );
  expect(stream.status).toBe(200);
  const events = await readFlowEvents(stream, 3);
  const prompt = events.at(-1)?.event;
  if (!prompt || prompt.type !== "flow.prompt") throw new Error("missing prompt");
  const response = await fetch(
    new URL(
      `/v1/flows/${flowId}/prompts/${prompt.promptId}/responses`,
      descriptor.endpoint,
    ),
    {
      method: "POST",
      headers: headers(descriptor),
      body: JSON.stringify({ response: "oauth-secret-code" }),
    },
  );
  expect(response.status).toBe(200);
  const completed = await readFlowEvents(
    await fetch(new URL(`/v1/flows/${flowId}/events?after=3`, descriptor.endpoint), {
      headers: headers(descriptor),
    }),
    1,
  );
  expect(completed.at(-1)?.event).toMatchObject({ type: "flow.completed" });
};

interface DefaultsResponseBody {
  readonly defaults: {
    readonly defaultModel: {
      readonly providerId: string;
      readonly modelId: string;
    } | null;
    readonly defaultThinkingLevel: string | null;
  };
}

describe("Host-global defaults sync with provider auth", () => {
  it("initializes defaults after the first successful API-key save using the first available model of the newly authenticated provider", async () => {
    const root = await temp();
    const fixture = makeFixture();
    const { descriptor } = await start(root, fixture);

    const before = await getDefaults(descriptor);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({
      defaults: { defaultModel: null, defaultThinkingLevel: null },
    });

    const marker = "sk-ant-secret-marker";
    const set = await setApiKey(descriptor, "anthropic", marker);
    expect(set.status).toBe(200);
    expect(JSON.stringify(set.body)).not.toContain(marker);

    const after = await getDefaults(descriptor);
    expect(after.status).toBe(200);
    expect((after.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
      },
      defaultThinkingLevel: "off",
    });
    expect(JSON.stringify(after.body)).not.toContain(marker);
  });

  it("initializes defaults after OAuth flow completion using the first available model of the newly authenticated provider", async () => {
    const root = await temp();
    const fixture = makeFixture();
    const { descriptor } = await start(root, fixture);

    await completeOAuthFlow(descriptor, "google");

    const after = await getDefaults(descriptor);
    expect(after.status).toBe(200);
    expect((after.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: { providerId: "google", modelId: "gemini-2-5-pro" },
      defaultThinkingLevel: "off",
    });
  });

  it("never overwrites an existing default when provider auth is added or changed", async () => {
    const root = await temp();
    const fixture = makeFixture();
    const { descriptor } = await start(root, fixture);

    const first = await setApiKey(descriptor, "google", "sk-google-secret-marker");
    expect(first.status).toBe(200);
    const seeded = await getDefaults(descriptor);
    expect((seeded.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: { providerId: "google", modelId: "gemini-2-5-pro" },
      defaultThinkingLevel: "off",
    });

    const customized = await fetch(
      new URL("/v1/agent-runtime/defaults", descriptor.endpoint),
      {
        method: "PUT",
        headers: headers(descriptor),
        body: JSON.stringify({
          defaultModel: { providerId: "google", modelId: "gemini-2-5-pro" },
          defaultThinkingLevel: "high",
        }),
      },
    );
    expect(customized.status).toBe(200);

    // Adding auth for another provider must not overwrite the default.
    const added = await setApiKey(descriptor, "anthropic", "sk-ant-secret-marker");
    expect(added.status).toBe(200);
    const afterAdd = await getDefaults(descriptor);
    expect((afterAdd.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: { providerId: "google", modelId: "gemini-2-5-pro" },
      defaultThinkingLevel: "high",
    });

    // Changing auth for the configured provider must not overwrite either.
    const changed = await setApiKey(descriptor, "google", "sk-google-rotated-marker");
    expect(changed.status).toBe(200);
    const afterChange = await getDefaults(descriptor);
    expect((afterChange.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: { providerId: "google", modelId: "gemini-2-5-pro" },
      defaultThinkingLevel: "high",
    });
  });

  it("clears the default when removing auth makes the selected model unavailable", async () => {
    const root = await temp();
    const fixture = makeFixture();
    const { descriptor } = await start(root, fixture);

    const set = await setApiKey(descriptor, "anthropic", "sk-ant-secret-marker");
    expect(set.status).toBe(200);
    const seeded = await getDefaults(descriptor);
    expect(
      (seeded.body as DefaultsResponseBody).defaults.defaultModel,
    ).toEqual({ providerId: "anthropic", modelId: "claude-sonnet-4-5" });

    const removed = await removeApiKey(descriptor, "anthropic");
    expect(removed.status).toBe(200);
    expect(JSON.stringify(removed.body)).not.toContain("sk-ant-secret-marker");

    const after = await getDefaults(descriptor);
    expect(after.status).toBe(200);
    expect((after.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: null,
      defaultThinkingLevel: null,
    });
  });

  it("auto-selects the first available replacement after auth removal", async () => {
    const root = await temp();
    const fixture = makeFixture();
    const { descriptor } = await start(root, fixture);

    const first = await setApiKey(descriptor, "google", "sk-google-secret-marker");
    expect(first.status).toBe(200);
    const seeded = await getDefaults(descriptor);
    expect((seeded.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: { providerId: "google", modelId: "gemini-2-5-pro" },
      defaultThinkingLevel: "off",
    });

    const second = await setApiKey(descriptor, "anthropic", "sk-ant-secret-marker");
    expect(second.status).toBe(200);
    const unchanged = await getDefaults(descriptor);
    expect((unchanged.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: { providerId: "google", modelId: "gemini-2-5-pro" },
      defaultThinkingLevel: "off",
    });

    const removed = await removeApiKey(descriptor, "google");
    expect(removed.status).toBe(200);

    const after = await getDefaults(descriptor);
    expect(after.status).toBe(200);
    expect((after.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "off",
    });
  });

  it("keeps auth operations succeeding without changing defaults when the model catalog is unavailable", async () => {
    const root = await temp();
    const configured = new Map<string, ProviderAuthMethod>();
    const fixture = makeFixture(configured);
    const { descriptor } = await start(root, {
      providerAuth: fixture.providerAuth,
      modelCatalog: {
        listModels: async () => {
          throw new Error("catalog unavailable");
        },
        validateSelection: async () => undefined,
      },
    });

    const set = await setApiKey(descriptor, "anthropic", "sk-ant-secret-marker");
    expect(set.status).toBe(200);

    const defaults = await getDefaults(descriptor);
    expect(defaults.status).toBe(200);
    expect((defaults.body as DefaultsResponseBody).defaults).toEqual({
      defaultModel: null,
      defaultThinkingLevel: null,
    });

    const removed = await removeApiKey(descriptor, "anthropic");
    expect(removed.status).toBe(200);
  });
});
