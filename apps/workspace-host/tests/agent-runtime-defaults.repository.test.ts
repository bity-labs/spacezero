import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAgentRuntimeDefaultsRepository,
} from "../dist/features/agent-runtime/agent-runtime-defaults.repository.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-defaults-repository-"));
  dirs.push(dir);
  return dir;
};

// Same DDL as createAgentRuntimeDefaultsMigration in host-migrations.ts.
const createTable = (databasePath: string) => {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`CREATE TABLE agent_runtime_defaults (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  default_provider_id TEXT CHECK (default_provider_id IS NULL OR length(default_provider_id) BETWEEN 1 AND 128),
  default_model_id TEXT CHECK (default_model_id IS NULL OR length(default_model_id) BETWEEN 1 AND 256),
  default_thinking_level TEXT CHECK (default_thinking_level IS NULL OR default_thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  updated_at TEXT NOT NULL,
  CHECK ((default_provider_id IS NULL) = (default_model_id IS NULL))
)`);
  } finally {
    db.close();
  }
};

const repository = (databasePath: string) =>
  createAgentRuntimeDefaultsRepository({ databasePath });

describe("AgentRuntimeDefaultsRepository.putIfAbsentModel", () => {
  it("applies the defaults when no default model exists on a fresh Host", async () => {
    const root = await temp();
    createTable(join(root, "host.sqlite"));
    const repo = repository(join(root, "host.sqlite"));

    const result = await repo.putIfAbsentModel({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "off",
    });

    expect(result).toEqual({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "off",
    });
    expect(await repo.get()).toEqual(result);
  });

  it("keeps the existing default when one is already present", async () => {
    const root = await temp();
    createTable(join(root, "host.sqlite"));
    const repo = repository(join(root, "host.sqlite"));
    await repo.put({
      defaultModel: { providerId: "openai", modelId: "gpt-5.2" },
      defaultThinkingLevel: "low",
    });

    const result = await repo.putIfAbsentModel({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "off",
    });

    expect(result).toEqual({
      defaultModel: { providerId: "openai", modelId: "gpt-5.2" },
      defaultThinkingLevel: "low",
    });
    expect(await repo.get()).toEqual(result);
  });

  it("applies the defaults when the stored row has no default model", async () => {
    const root = await temp();
    createTable(join(root, "host.sqlite"));
    const repo = repository(join(root, "host.sqlite"));
    await repo.put({ defaultModel: null, defaultThinkingLevel: null });

    const result = await repo.putIfAbsentModel({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "medium",
    });

    expect(result).toEqual({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "medium",
    });
    expect(await repo.get()).toEqual(result);
  });

  it("resolves concurrent initialization to exactly one coherent default", async () => {
    const root = await temp();
    createTable(join(root, "host.sqlite"));
    const repo = repository(join(root, "host.sqlite"));

    const contenders = [
      { defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" }, defaultThinkingLevel: "off" as const },
      { defaultModel: { providerId: "openai", modelId: "gpt-5.2" }, defaultThinkingLevel: "low" as const },
      { defaultModel: { providerId: "google", modelId: "gemini-3-pro" }, defaultThinkingLevel: "medium" as const },
    ];
    const results = await Promise.all(contenders.map((defaults) => repo.putIfAbsentModel(defaults)));

    const stored = await repo.get();
    // Every caller reports the actual final stored state, and the stored
    // default is exactly one contender's model with a coherent thinking level.
    expect(new Set(results.map((r) => JSON.stringify(r)))).toEqual(
      new Set([JSON.stringify(stored)]),
    );
    expect(contenders.map((c) => JSON.stringify(c))).toContain(JSON.stringify(stored));
  });
});
