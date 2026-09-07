import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSkillPreferencesRepository,
} from "../dist/features/agent-resources/skill-preferences.repository.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-skill-preferences-"));
  dirs.push(dir);
  return dir;
};

// Same DDL as createSkillPreferencesMigration in host-migrations.ts.
const createTable = (databasePath: string) => {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`CREATE TABLE skill_preferences (
  skill_name TEXT PRIMARY KEY NOT NULL CHECK (length(skill_name) BETWEEN 1 AND 128),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL
)`);
  } finally {
    db.close();
  }
};

describe("SkillPreferencesRepository", () => {
  it("reports no disabled skills on an empty preferences table", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    createTable(databasePath);
    const repository = createSkillPreferencesRepository({ databasePath });

    await expect(repository.listDisabledSkillNames()).resolves.toEqual(
      new Set(),
    );
  });

  it("returns only disabled skill names across re-enable cycles", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    createTable(databasePath);
    const repository = createSkillPreferencesRepository({ databasePath });

    await repository.setEnabled({ name: "release-plan", enabled: false });
    await repository.setEnabled({ name: "shadcn", enabled: false });
    await repository.setEnabled({ name: "still-enabled", enabled: true });

    await expect(repository.listDisabledSkillNames()).resolves.toEqual(
      new Set(["release-plan", "shadcn"]),
    );

    await repository.setEnabled({ name: "release-plan", enabled: true });

    await expect(repository.listDisabledSkillNames()).resolves.toEqual(
      new Set(["shadcn"]),
    );
  });

  it("updates the timestamp of an existing preference row", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    createTable(databasePath);
    const repository = createSkillPreferencesRepository({ databasePath });

    await repository.setEnabled({ name: "release-plan", enabled: false });
    const before = new DatabaseSync(databasePath)
      .prepare("SELECT updated_at FROM skill_preferences WHERE skill_name = ?")
      .get("release-plan") as { updated_at: string };

    await repository.setEnabled({ name: "release-plan", enabled: true });
    const after = new DatabaseSync(databasePath)
      .prepare("SELECT enabled, updated_at FROM skill_preferences WHERE skill_name = ?")
      .get("release-plan") as { enabled: number; updated_at: string };

    expect(after.enabled).toBe(1);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updated_at).getTime(),
    );
  });
});
