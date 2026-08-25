import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseProviderAuthStatusResult,
  type HostConnectionDescriptor,
} from "@spacezero/host-contracts";
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

const start = async (root: string) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath: join(root, "host.sqlite"),
    harnessAuthDirectory: join(root, "private-host-data", "harness-auth"),
    spaceZeroHome: join(root, "SpaceZero"),
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

describe("harness auth Host protocol", () => {
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
