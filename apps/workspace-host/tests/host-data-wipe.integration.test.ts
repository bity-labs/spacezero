import { Effect } from "effect";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ConversationRunner } from "@spacezero/pi-adapter";
import {
  KNOWN_HOST_TABLES,
  runHostDatabaseMigrations,
} from "../dist/runtime/host-database.js";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";
import { seedAgentRuntimeDefaults } from "./agent-runtime-defaults.helpers.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-host-data-wipe-"));
  temps.push(dir);
  return dir;
};

const echoRunner: ConversationRunner = {
  submitTurn: async (input) => ({ text: `Echo: ${input.prompt}` }),
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
    ...(conversationRunner === undefined ? {} : { conversationRunner }),
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

const waitFor = async (assertion: () => Promise<void>) => {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError ?? new Error("waitFor timed out");
};

const recordedVersion = (databasePath: string): number | undefined => {
  const db = new DatabaseSync(databasePath);
  try {
    const row = db
      .prepare(
        "SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id DESC LIMIT 1",
      )
      .get() as { migration_id: number } | undefined;
    return row?.migration_id;
  } finally {
    db.close();
  }
};

const countRows = (databasePath: string, table: string): number => {
  const db = new DatabaseSync(databasePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    };
    return row.count;
  } finally {
    db.close();
  }
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
      body: JSON.stringify({ commandId: crypto.randomUUID(), firstPrompt }),
    },
  );
  return {
    response,
    body: (await response.json()) as { session?: { id: string } },
  };
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

describe("Pre-release Host data wipe policy", () => {
  it(
    "wipes an outdated durable database, recreates it at the current version, " +
      "and keeps Global Chat Sessions operating",
    async () => {
      const root = await temp();
      const databasePath = join(root, "host.sqlite");
      const spaceZeroHome = join(root, "SpaceZero");

      const first = await start(databasePath, spaceZeroHome, echoRunner);
      seedAgentRuntimeDefaults(databasePath);
      const firstClient = descriptor(first);
      const created = await createGlobalChatSession(
        first,
        firstClient.clientCapability,
        "hello before wipe",
      );
      expect(created.response.status).toBe(200);
      const sessionId = created.body.session?.id;
      expect(sessionId).toBeDefined();
      await first.stop();
      hosts = [];

      // Simulate a pre-version-11 developer database: a legacy recorded
      // version whose durable conversation rows cannot satisfy the required
      // multi-message turn shapes.
      expect(recordedVersion(databasePath)).toBe(11);
      {
        const db = new DatabaseSync(databasePath);
        try {
          db.prepare(
            "DELETE FROM effect_sql_migrations WHERE migration_id = 11",
          ).run();
          expect(recordedVersion(databasePath)).toBe(10);
        } finally {
          db.close();
        }
      }

      const restarted = await start(databasePath, spaceZeroHome, echoRunner);
      expect(recordedVersion(databasePath)).toBe(11);
      expect(countRows(databasePath, "chat_sessions")).toBe(0);
      expect(countRows(databasePath, "chat_session_turns")).toBe(0);
      expect(countRows(databasePath, "chat_session_events")).toBe(0);
      expect(countRows(databasePath, "chat_session_command_receipts")).toBe(0);

      // Wiped Session identity is gone; the old session id no longer exists.
      seedAgentRuntimeDefaults(databasePath);
      const restartedClient = descriptor(restarted);
      const stale = await listGlobalChatMessages(
        restarted,
        restartedClient.clientCapability,
        sessionId as string,
      );
      expect(stale.response.status).toBe(404);

      // Sessions operate normally on the recreated database.
      const fresh = await createGlobalChatSession(
        restarted,
        restartedClient.clientCapability,
        "hello after wipe",
      );
      expect(fresh.response.status).toBe(200);
      const freshSessionId = fresh.body.session?.id;
      expect(freshSessionId).toBeDefined();
      await waitFor(async () => {
        const listed = await listGlobalChatMessages(
          restarted,
          restartedClient.clientCapability,
          freshSessionId as string,
        );
        expect(listed.response.status).toBe(200);
        expect(listed.body).toMatchObject({
          messages: [
            { role: "user", text: "hello after wipe" },
            { role: "assistant", text: "Echo: hello after wipe" },
          ],
          latestTurn: {
            state: "completed",
            assistantMessageIds: [expect.any(String)],
          },
        });
      });
    },
  );

  it("refuses to start when the recorded version is newer than required", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const spaceZeroHome = join(root, "SpaceZero");
    const first = await start(databasePath, spaceZeroHome);
    await first.stop();
    hosts = [];

    const db = new DatabaseSync(databasePath);
    try {
      db.prepare(
        "UPDATE effect_sql_migrations SET migration_id = migration_id + 1 WHERE migration_id = 11",
      ).run();
    } finally {
      db.close();
    }
    expect(recordedVersion(databasePath)).toBe(12);

    await expect(start(databasePath, spaceZeroHome)).rejects.toThrow(
      /refusing to start.*newer than required/u,
    );
  });

  it("refuses to start when host tables exist without a readable version record", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const db = new DatabaseSync(databasePath);
    try {
      db.exec("CREATE TABLE chat_sessions (session_id TEXT PRIMARY KEY)");
    } finally {
      db.close();
    }

    await expect(start(databasePath, join(root, "SpaceZero"))).rejects.toThrow(
      /refusing to start.*host tables without version record/u,
    );
  });

  it("refuses to start when a migration-chain table like chat_session_command_receipts exists without a version record", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(
        "CREATE TABLE chat_session_command_receipts (command_id TEXT PRIMARY KEY)",
      );
    } finally {
      db.close();
    }

    await expect(start(databasePath, join(root, "SpaceZero"))).rejects.toThrow(
      /refusing to start.*host tables without version record/u,
    );
  });

  it("known host tables match exactly the tables created by the migration chain", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    await Effect.runPromise(runHostDatabaseMigrations(databasePath));

    const db = new DatabaseSync(databasePath);
    let migratedTables: string[];
    try {
      migratedTables = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name);
    } finally {
      db.close();
    }

    expect([...KNOWN_HOST_TABLES].sort()).toEqual(migratedTables);
  });

  it("refuses to start and keeps the file when the database is unreadable", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const contents = "this is not a sqlite database";
    await writeFile(databasePath, contents);

    await expect(
      start(databasePath, join(root, "SpaceZero")),
    ).rejects.toThrow();

    expect(await readFile(databasePath, "utf8")).toBe(contents);
  });
});
