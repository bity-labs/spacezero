import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PiModelCatalogService } from "@spacezero/pi-adapter";
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
  const dir = await mkdtemp(join(tmpdir(), "spacezero-agent-runtime-"));
  dirs.push(dir);
  return dir;
};

const start = async (modelCatalog: PiModelCatalogService) => {
  const root = await temp();
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

describe("Agent Runtime Host protocol", () => {
  it("lists sanitized model descriptors for authenticated clients", async () => {
    const { descriptor } = await start({
      listModels: async () => [
        {
          providerId: "anthropic",
          providerDisplayName: "Anthropic",
          modelId: "claude-sonnet-4-5",
          displayName: "Claude Sonnet 4.5",
          authenticated: true,
          available: true,
          reasoningSupported: true,
          supportedThinkingLevels: ["off", "high"],
          contextWindow: 200000,
          maxTokens: 8192,
        },
      ],
      validateSelection: async () => undefined,
    });

    const response = await fetch(
      new URL("/v1/agent-runtime/models", descriptor.endpoint),
      {
        headers: {
          Authorization: `Bearer ${descriptor.clientCapability}`,
          Origin: origin,
        },
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown;
    expect(body).toEqual({
      models: [
        {
          providerId: "anthropic",
          providerDisplayName: "Anthropic",
          modelId: "claude-sonnet-4-5",
          displayName: "Claude Sonnet 4.5",
          authenticated: true,
          available: true,
          reasoningSupported: true,
          supportedThinkingLevels: ["off", "high"],
          contextWindow: 200000,
          maxTokens: 8192,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("apiKey");
    expect(JSON.stringify(body)).not.toContain("/private-host-data/");
  });

  it("requires the renderer origin", async () => {
    const { descriptor } = await start({
      listModels: async () => [],
      validateSelection: async () => undefined,
    });

    const response = await fetch(
      new URL("/v1/agent-runtime/models", descriptor.endpoint),
      {
        headers: {
          Authorization: `Bearer ${descriptor.clientCapability}`,
          Origin: "spacezero://attacker",
        },
      },
    );

    expect(response.status).toBe(403);
  });
});
