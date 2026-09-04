import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ConversationRunner } from "@spacezero/pi-adapter";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-global-chat-session-"));
  temps.push(dir);
  return dir;
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

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("Global Chat Session Host protocol", () => {
  it("creates a durable unarchived Global Chat Session from the first prompt without Project, worktree, Git, source identity, or a Pi turn", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    let providerCalls = 0;
    const runner: ConversationRunner = {
      submitTurn: async () => {
        providerCalls += 1;
        return { text: "should not be called" };
      },
    };
    const host = await start(databasePath, join(root, "SpaceZero"), runner);
    const client = descriptor(host);

    const created = await createGlobalChatSession(
      host,
      client.clientCapability,
      `  ${"Release plan ".repeat(8)}\nsecond line is ignored`,
    );

    expect(created.response.status).toBe(200);
    const body = created.body as {
      session: Record<string, unknown>;
      firstMessage: Record<string, unknown>;
    };
    expect(body.session).toMatchObject({
      title: "Release plan Release plan Release plan Release plan Release ",
      archived: false,
      lastSequence: 2,
    });
    expect(body.session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.session).not.toHaveProperty("projectId");
    expect(body.session).not.toHaveProperty("worktreePath");
    expect(body.session).not.toHaveProperty("managedBranch");
    expect(body.session).not.toHaveProperty("sourceCommit");
    expect(body.firstMessage).toMatchObject({
      role: "user",
      text: `${"Release plan ".repeat(8)}\nsecond line is ignored`,
      sequence: 2,
    });
    expect(providerCalls).toBe(0);

    const sessions = readRows<{
      session_id: string;
      title: string;
      archived_at: string | null;
      last_sequence: number;
    }>(
      databasePath,
      "SELECT session_id, title, archived_at, last_sequence FROM global_chat_sessions",
    );
    expect(sessions).toEqual([
      {
        session_id: body.session.id as string,
        title: body.session.title as string,
        archived_at: null,
        last_sequence: 2,
      },
    ]);
    const sessionColumns = readRows<{ name: string }>(
      databasePath,
      "PRAGMA table_info(global_chat_sessions)",
    ).map((row) => row.name);
    expect(sessionColumns).not.toContain("project_id");
    expect(sessionColumns).not.toContain("worktree_path");
    expect(sessionColumns).not.toContain("managed_branch");
    expect(sessionColumns).not.toContain("source_commit");
    expect(
      readRows<{ role: string; text: string; sequence: number }>(
        databasePath,
        "SELECT role, text, sequence FROM global_chat_messages WHERE session_id = ? ORDER BY sequence ASC",
        body.session.id as string,
      ),
    ).toEqual([
      {
        role: "user",
        text: body.firstMessage.text as string,
        sequence: 2,
      },
    ]);
    expect(
      readRows<{ event_type: string; sequence: number }>(
        databasePath,
        "SELECT event_type, sequence FROM global_chat_session_events WHERE session_id = ? ORDER BY sequence ASC",
        body.session.id as string,
      ),
    ).toEqual([
      { event_type: "GlobalChatSessionCreatedV1", sequence: 1 },
      { event_type: "GlobalChatUserMessageSubmittedV1", sequence: 2 },
    ]);
  });

  it("replays duplicate create commands with the same input and rejects command ID conflicts", async () => {
    const root = await temp();
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const commandId = randomUUID();

    const first = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Plan agent capabilities",
      commandId,
    );
    const replayed = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Plan agent capabilities",
      commandId,
    );
    const conflict = await createGlobalChatSession(
      host,
      client.clientCapability,
      "Plan something else",
      commandId,
    );

    expect(first.response.status).toBe(200);
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toEqual(first.body);
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "command_id_conflict" });
  });
});
