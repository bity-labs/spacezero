import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseFlowEventEnvelope,
  parseListProviderAuthOptionsResult,
  parseProviderAuthStatusResult,
  type FlowEventEnvelope,
  type HostConnectionDescriptor,
} from "@spacezero/host-contracts";
import type { ProviderAuthService } from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
let hosts: StartedHostServer[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop()));
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-harness-auth-"));
  dirs.push(dir);
  return dir;
};

const start = async (root: string, providerAuth?: ProviderAuthService) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath: join(root, "host.sqlite"),
    harnessAuthDirectory: join(root, "private-host-data", "harness-auth"),
    spaceZeroHome: join(root, "SpaceZero"),
    ...(providerAuth ? { providerAuth } : {}),
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

const status = async (
  descriptor: HostConnectionDescriptor,
  providerId = "anthropic",
  requestOrigin = origin,
) =>
  fetch(
    new URL(
      `/v1/harness-auth/providers/${providerId}/status`,
      descriptor.endpoint,
    ),
    {
      headers: headers(descriptor, requestOrigin),
    },
  );

const readFlowEvents = async (
  response: Response,
  count: number,
): Promise<{ events: FlowEventEnvelope[]; text: string }> => {
  if (!response.body) throw new Error("missing SSE body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const events: FlowEventEnvelope[] = [];
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
  return { events, text: buffered };
};

const fakeOAuthProviderAuth = (): ProviderAuthService => {
  let configured = false;
  return {
    listOptions: async () => [
      {
        providerId: "anthropic",
        displayName: "Anthropic",
        authMethods: ["oauth"],
        configured,
        ...(configured ? { configuredMethod: "oauth" as const } : {}),
      },
    ],
    status: async (providerId) => ({
      providerId,
      configured,
      source: configured ? "stored" : "missing",
    }),
    loginOAuth: async (providerId, interaction) => {
      interaction.notify({ type: "progress", message: "Starting sign-in" });
      interaction.notify({
        type: "device_code",
        userCode: "USER-CODE",
        verificationUri: "https://example.com/device",
      });
      const code = await interaction.prompt({
        type: "manual_code",
        message: "Paste the authorization code",
        placeholder: "code",
      });
      if (code !== "oauth-secret-code") throw new Error("bad code");
      configured = true;
      return { providerId, configured: true, source: "stored" };
    },
    setApiKey: async (providerId) => ({
      providerId,
      configured,
      source: "missing",
    }),
    removeApiKey: async (providerId) => {
      configured = false;
      return { providerId, configured: false, source: "missing" };
    },
  };
};

describe("harness auth Host protocol", () => {
  it("lists available provider auth methods without returning secrets", async () => {
    const root = await temp();
    const { descriptor } = await start(root);

    const listed = await fetch(
      new URL("/v1/harness-auth/providers", descriptor.endpoint),
      { headers: headers(descriptor) },
    );

    expect(listed.status).toBe(200);
    const text = await listed.text();
    const body = parseListProviderAuthOptionsResult(
      JSON.parse(text) as unknown,
    );
    expect(text).not.toContain("sk-");
    expect(body.providers.length).toBeGreaterThan(0);
    expect(body.providers).toContainEqual(
      expect.objectContaining({
        providerId: "anthropic",
        displayName: expect.any(String) as string,
        authMethods: expect.arrayContaining(["api_key"]),
        configured: false,
      }),
    );
  });

  it("reports, sets, persists, and removes provider API-key status without returning secrets", async () => {
    const root = await temp();
    const { host, descriptor } = await start(root);

    const missing = await status(descriptor);
    expect(missing.status).toBe(200);
    expect(parseProviderAuthStatusResult(await missing.json())).toEqual({
      status: { providerId: "anthropic", configured: false, source: "missing" },
    });

    const marker = "sk-ant-secret-marker";
    const set = await fetch(
      new URL(
        "/v1/harness-auth/providers/anthropic/api-key",
        descriptor.endpoint,
      ),
      {
        method: "PUT",
        headers: headers(descriptor),
        body: JSON.stringify({ apiKey: marker }),
      },
    );
    expect(set.status).toBe(200);
    const setText = await set.text();
    expect(setText).not.toContain(marker);
    expect(
      parseProviderAuthStatusResult(JSON.parse(setText) as unknown),
    ).toEqual({
      status: { providerId: "anthropic", configured: true, source: "stored" },
    });
    const listedAfterSet = await fetch(
      new URL("/v1/harness-auth/providers", descriptor.endpoint),
      { headers: headers(descriptor) },
    );
    expect(listedAfterSet.status).toBe(200);
    expect(
      parseListProviderAuthOptionsResult(await listedAfterSet.json()).providers,
    ).toContainEqual(
      expect.objectContaining({
        providerId: "anthropic",
        configured: true,
        configuredMethod: "api_key",
      }),
    );
    await expect(
      readFile(join(root, "host.sqlite"), "utf8"),
    ).resolves.not.toContain(marker);

    await host.stop();
    hosts = hosts.filter((candidate) => candidate !== host);
    const restarted = await startHostServer({
      allowedRendererOrigin: origin,
      bootstrap: { consume: () => undefined },
      databasePath: join(root, "host.sqlite"),
      harnessAuthDirectory: join(root, "private-host-data", "harness-auth"),
      spaceZeroHome: join(root, "SpaceZero"),
    });
    hosts.push(restarted);
    const restartedDescriptor = restarted.capabilities.mintClient(
      restarted.capabilities.issueSupervisor(),
    );
    const persisted = await status(restartedDescriptor);
    expect(persisted.status).toBe(200);
    await expect(persisted.json()).resolves.toEqual({
      status: { providerId: "anthropic", configured: true, source: "stored" },
    });

    const remove = await fetch(
      new URL(
        "/v1/harness-auth/providers/anthropic/api-key",
        restartedDescriptor.endpoint,
      ),
      { method: "DELETE", headers: headers(restartedDescriptor) },
    );
    expect(remove.status).toBe(200);
    await expect(remove.json()).resolves.toEqual({
      status: { providerId: "anthropic", configured: false, source: "missing" },
    });
  });

  it("runs OAuth login flows through authenticated flow prompts without exposing secrets", async () => {
    const root = await temp();
    const { descriptor } = await start(root, fakeOAuthProviderAuth());

    const started = await fetch(
      new URL(
        "/v1/harness-auth/providers/anthropic/oauth-flows",
        descriptor.endpoint,
      ),
      { method: "POST", headers: headers(descriptor) },
    );
    expect(started.status).toBe(200);
    const { flowId } = (await started.json()) as { flowId: string };

    const stream = await fetch(
      new URL(`/v1/flows/${flowId}/events?after=0`, descriptor.endpoint),
      { headers: headers(descriptor) },
    );
    expect(stream.status).toBe(200);
    const initial = await readFlowEvents(stream, 4);
    expect(initial.events.map((event) => event.event.type)).toEqual([
      "flow.started",
      "flow.progress",
      "flow.device_code",
      "flow.prompt",
    ]);
    expect(JSON.stringify(initial.events)).not.toContain("oauth-secret-code");
    const prompt = initial.events.at(-1)?.event;
    expect(prompt).toMatchObject({
      type: "flow.prompt",
      promptType: "manual_code",
    });
    if (!prompt || prompt.type !== "flow.prompt")
      throw new Error("missing prompt");

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
    await expect(response.text()).resolves.not.toContain("oauth-secret-code");

    const completedStream = await fetch(
      new URL(
        `/v1/flows/${flowId}/events?after=${initial.events.at(-1)!.sequence}`,
        descriptor.endpoint,
      ),
      { headers: headers(descriptor) },
    );
    const completed = await readFlowEvents(completedStream, 1);
    expect(completed.events).toEqual([
      expect.objectContaining({
        event: {
          type: "flow.completed",
          status: {
            providerId: "anthropic",
            configured: true,
            source: "stored",
          },
        },
      }),
    ]);
    await expect(
      readFile(join(root, "host.sqlite"), "utf8"),
    ).resolves.not.toContain("oauth-secret-code");
  });

  it("cancels OAuth flows and denies unauthenticated flow operations", async () => {
    const root = await temp();
    const { host, descriptor } = await start(root, fakeOAuthProviderAuth());
    const started = await fetch(
      new URL(
        "/v1/harness-auth/providers/anthropic/oauth-flows",
        descriptor.endpoint,
      ),
      { method: "POST", headers: headers(descriptor) },
    );
    const { flowId } = (await started.json()) as { flowId: string };
    const stream = await fetch(
      new URL(`/v1/flows/${flowId}/events?after=0`, descriptor.endpoint),
      { headers: headers(descriptor) },
    );
    const initial = await readFlowEvents(stream, 4);
    const prompt = initial.events.at(-1)?.event;
    if (!prompt || prompt.type !== "flow.prompt")
      throw new Error("missing prompt");

    expect(
      (
        await fetch(
          new URL(`/v1/flows/${flowId}/events?after=0`, descriptor.endpoint),
          {
            headers: { Origin: origin },
          },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(
          new URL(`/v1/flows/${flowId}/cancel`, descriptor.endpoint),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${host.capabilities.issueSupervisor()}`,
              Origin: origin,
            },
          },
        )
      ).status,
    ).toBe(403);

    const cancelled = await fetch(
      new URL(`/v1/flows/${flowId}/cancel`, descriptor.endpoint),
      { method: "POST", headers: headers(descriptor) },
    );
    expect(cancelled.status).toBe(200);
    const cancelStream = await fetch(
      new URL(
        `/v1/flows/${flowId}/events?after=${initial.events.at(-1)!.sequence}`,
        descriptor.endpoint,
      ),
      { headers: headers(descriptor) },
    );
    const terminal = await readFlowEvents(cancelStream, 1);
    expect(terminal.events[0]?.event).toEqual({ type: "flow.cancelled" });
    const lateResponse = await fetch(
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
    expect(lateResponse.status).toBe(409);
  });

  it("denies unauthenticated, wrong-origin, supervisor-scoped, invalid provider, and invalid secret requests", async () => {
    const root = await temp();
    const { host, descriptor } = await start(root);

    expect(
      (
        await fetch(
          new URL(
            "/v1/harness-auth/providers/anthropic/status",
            descriptor.endpoint,
          ),
          {
            headers: { Origin: origin },
          },
        )
      ).status,
    ).toBe(401);
    expect((await status(descriptor, "anthropic", "null")).status).toBe(403);
    expect(
      (
        await fetch(
          new URL(
            "/v1/harness-auth/providers/anthropic/status",
            descriptor.endpoint,
          ),
          {
            headers: {
              Authorization: `Bearer ${host.capabilities.issueSupervisor()}`,
              Origin: origin,
            },
          },
        )
      ).status,
    ).toBe(403);
    expect((await status(descriptor, "../anthropic")).status).toBe(404);
    expect((await status(descriptor, "not-a-provider")).status).toBe(422);

    const unsupportedApiKeyProvider = await fetch(
      new URL(
        "/v1/harness-auth/providers/openai-codex/api-key",
        descriptor.endpoint,
      ),
      {
        method: "PUT",
        headers: headers(descriptor),
        body: JSON.stringify({ apiKey: "secret-marker" }),
      },
    );
    expect(unsupportedApiKeyProvider.status).toBe(422);
    await expect(unsupportedApiKeyProvider.text()).resolves.not.toContain(
      "secret-marker",
    );

    const invalidSecret = await fetch(
      new URL(
        "/v1/harness-auth/providers/anthropic/api-key",
        descriptor.endpoint,
      ),
      {
        method: "PUT",
        headers: headers(descriptor),
        body: JSON.stringify({ apiKey: "" }),
      },
    );
    expect(invalidSecret.status).toBe(422);
  });
});
