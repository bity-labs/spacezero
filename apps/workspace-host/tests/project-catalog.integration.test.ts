import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-project-catalog-"));
  temps.push(dir);
  return dir;
};
const run = (cmd: string, args: readonly string[], cwd: string) =>
  new Promise<void>((resolve, reject) => {
    execFile(cmd, args, { cwd, shell: false }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
const gitCommit = async (repo: string, filename: string, content: string) => {
  await writeFile(join(repo, filename), content);
  await run("git", ["add", filename], repo);
  await run("git", ["commit", "-q", "-m", filename], repo);
};
const gitRepo = async (root: string, name = "repo") => {
  const repo = join(root, name);
  await mkdir(repo);
  await run("git", ["init", "-q"], repo);
  await run("git", ["config", "user.email", "agent@example.invalid"], repo);
  await run("git", ["config", "user.name", "Agent"], repo);
  await gitCommit(repo, "README.md", "hello\n");
  return repo;
};
const unbornGitRepo = async (root: string) => {
  const repo = join(root, "unborn");
  await mkdir(repo);
  await run("git", ["init", "-q"], repo);
  return repo;
};
const start = async (databasePath: string) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath,
  });
  hosts.push(host);
  return host;
};
const descriptor = (host: StartedHostServer) => {
  const supervisor = host.capabilities.issueSupervisor();
  return host.capabilities.mintClient(supervisor);
};
const authHeaders = (clientCapability: string) => ({
  Authorization: `Bearer ${clientCapability}`,
  Origin: origin,
  "Content-Type": "application/json",
});
const register = async (
  host: StartedHostServer,
  clientCapability: string,
  path: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(new URL("/v1/projects", host.endpoint), {
    method: "POST",
    headers: authHeaders(clientCapability),
    body: JSON.stringify({ commandId, path }),
  });
  const body = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : undefined;
  return { response, body: body as unknown };
};
const list = async (host: StartedHostServer, clientCapability: string) => {
  const response = await fetch(new URL("/v1/projects", host.endpoint), {
    headers: authHeaders(clientCapability),
  });
  return { response, body: (await response.json()) as { projects: unknown[] } };
};

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("Project catalog Host protocol", () => {
  it("registers a real Git repository and resolves nested/symlink duplicates to the existing Project", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const nested = join(repo, "nested");
    await mkdir(nested);
    const link = join(root, "repo-link");
    await symlink(repo, link);
    const host = await start(join(root, "host.sqlite"));
    const client = descriptor(host);

    const first = await register(host, client.clientCapability, repo);
    const second = await register(host, client.clientCapability, nested);
    const third = await register(host, client.clientCapability, link);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(third.response.status).toBe(200);
    expect(first.body).toMatchObject({ outcome: "registered" });
    expect(second.body).toMatchObject({
      outcome: "existing",
      project: { id: (first.body as { project: { id: string } }).project.id },
    });
    expect(third.body).toMatchObject({
      outcome: "existing",
      project: { id: (first.body as { project: { id: string } }).project.id },
    });
  });

  it("replays a command receipt before Git inspection after HEAD changes, path deletion, and restart", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath);
    const client = descriptor(host);
    const commandId = randomUUID();
    const created = await register(
      host,
      client.clientCapability,
      repo,
      commandId,
    );
    expect(created.response.status).toBe(200);
    await gitCommit(repo, "NEXT.md", "next\n");
    const afterHeadChange = await register(
      host,
      client.clientCapability,
      repo,
      commandId,
    );
    expect(afterHeadChange.response.status).toBe(200);
    expect(afterHeadChange.body).toEqual(created.body);
    await rm(repo, { recursive: true, force: true });
    const afterDelete = await register(
      host,
      client.clientCapability,
      repo,
      commandId,
    );
    expect(afterDelete.response.status).toBe(200);
    expect(afterDelete.body).toEqual(created.body);
    await host.stop();
    hosts = hosts.filter((value) => value !== host);

    const restarted = await start(databasePath);
    const restartedClient = descriptor(restarted);
    const afterRestart = await register(
      restarted,
      restartedClient.clientCapability,
      repo,
      commandId,
    );
    expect(afterRestart.response.status).toBe(200);
    expect(afterRestart.body).toEqual(created.body);
  });

  it("conflicts when a command ID is reused for a different path", async () => {
    const root = await temp();
    const firstRepo = await gitRepo(root, "first");
    const secondRepo = await gitRepo(root, "second");
    const host = await start(join(root, "host.sqlite"));
    const client = descriptor(host);
    const commandId = randomUUID();
    expect(
      (await register(host, client.clientCapability, firstRepo, commandId))
        .response.status,
    ).toBe(200);

    const conflict = await register(
      host,
      client.clientCapability,
      secondRepo,
      commandId,
    );
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "command_id_conflict" });
  });

  it("fails closed when .git is replaced in place without mutating the Project record", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath);
    const client = descriptor(host);
    const created = await register(host, client.clientCapability, repo);
    expect(created.response.status).toBe(200);
    const originalProject = (
      created.body as { project: { id: string; registeredHeadCommit: string } }
    ).project;

    await rm(join(repo, ".git"), { recursive: true, force: true });
    await run("git", ["init", "-q"], repo);
    await run("git", ["config", "user.email", "agent@example.invalid"], repo);
    await run("git", ["config", "user.name", "Agent"], repo);
    await gitCommit(repo, "REPLACED.md", "replaced\n");

    const replaced = await register(host, client.clientCapability, repo);
    expect(replaced.response.status).toBe(409);
    expect(replaced.body).toMatchObject({
      code: "repository_identity_mismatch",
    });
    const listed = await list(host, client.clientCapability);
    expect(listed.body.projects).toHaveLength(1);
    expect(listed.body.projects[0]).toMatchObject(originalProject);
  });

  it("persists the Project catalog across Host restart with fresh capabilities", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath);
    const client = descriptor(host);
    const created = await register(host, client.clientCapability, repo);
    expect(created.response.status).toBe(200);
    const createdBody = created.body as { project: { id: string } };
    await host.stop();
    hosts = hosts.filter((value) => value !== host);

    const restarted = await start(databasePath);
    const restartedClient = descriptor(restarted);
    const listed = await list(restarted, restartedClient.clientCapability);
    expect(listed.response.status).toBe(200);
    expect(listed.body.projects).toMatchObject([
      { id: createdBody.project.id },
    ]);
  });

  it("orders Projects stably by creation time then ID", async () => {
    const root = await temp();
    const firstRepo = await gitRepo(root, "first");
    const secondRepo = await gitRepo(root, "second");
    const host = await start(join(root, "host.sqlite"));
    const client = descriptor(host);
    const first = await register(host, client.clientCapability, firstRepo);
    const second = await register(host, client.clientCapability, secondRepo);
    const listed = await list(host, client.clientCapability);
    expect(listed.body.projects).toMatchObject([
      { id: (first.body as { project: { id: string } }).project.id },
      { id: (second.body as { project: { id: string } }).project.id },
    ]);
  });

  it("rejects non-Git and unborn repositories with static redacted guidance", async () => {
    const root = await temp();
    const nonGit = join(root, "not-git");
    await mkdir(nonGit);
    const unborn = await unbornGitRepo(root);
    const host = await start(join(root, "host.sqlite"));
    const client = descriptor(host);

    const nonGitResponse = await register(
      host,
      client.clientCapability,
      nonGit,
    );
    expect(nonGitResponse.response.status).toBe(422);
    expect(nonGitResponse.body).toEqual({
      code: "not_git_repository",
      message: "Choose a Git repository.",
    });
    expect(JSON.stringify(nonGitResponse.body)).not.toContain(nonGit);

    const unbornResponse = await register(
      host,
      client.clientCapability,
      unborn,
    );
    expect(unbornResponse.response.status).toBe(422);
    expect(unbornResponse.body).toEqual({
      code: "repository_has_no_commit",
      message: "Choose a Git repository with at least one commit.",
    });
    expect(JSON.stringify(unbornResponse.body)).not.toContain(unborn);
  });

  it("rejects wrong-scope, null-origin, and CORS preflight requests before Project registration", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(join(root, "host.sqlite"));
    const supervisor = host.capabilities.issueSupervisor();
    const client = host.capabilities.mintClient(supervisor);

    const wrongScope = await fetch(new URL("/v1/projects", host.endpoint), {
      method: "POST",
      headers: { ...authHeaders(supervisor) },
      body: JSON.stringify({ commandId: randomUUID(), path: repo }),
    });
    expect(wrongScope.status).toBe(403);

    const nullOrigin = await fetch(new URL("/v1/projects", host.endpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${client.clientCapability}`,
        Origin: "null",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commandId: randomUUID(), path: repo }),
    });
    expect(nullOrigin.status).toBe(403);

    const preflight = await fetch(new URL("/v1/projects", host.endpoint), {
      method: "OPTIONS",
      headers: {
        Origin: "null",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    });
    expect(preflight.headers.get("access-control-allow-origin")).not.toBe(
      "null",
    );
  });

  it("enforces the durable lowercase-hex HEAD constraint in SQLite", async () => {
    const root = await temp();
    const databasePath = join(root, "host.sqlite");
    const host = await start(databasePath);
    await host.stop();
    hosts = hosts.filter((value) => value !== host);
    const db = new DatabaseSync(databasePath);
    try {
      const stmt = db.prepare(`
INSERT INTO projects (project_id, display_name, canonical_root_path, canonical_git_dir_path, canonical_git_common_dir_path, root_device_id, root_file_id, common_dir_device_id, common_dir_file_id, registered_head_commit, created_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'bad', '/tmp/root', '/tmp/root/.git', '/tmp/root/.git', '1', '1', '2', '2', ?, '2026-01-01T00:00:00.000Z')`);
      expect(() => stmt.run(`a${"Z".repeat(39)}`)).toThrow();
      expect(() => stmt.run("a".repeat(40))).not.toThrow();
    } finally {
      db.close();
    }
  });

  it("aborts and force-cleans blocking Git subprocess inspection", async () => {
    const root = await temp();
    const repo = join(root, "repo");
    await mkdir(repo);
    const fakeBin = join(root, "bin");
    await mkdir(fakeBin);
    const marker = join(root, "fake-git.pid");
    const fakeGit = join(fakeBin, "git");
    await writeFile(
      fakeGit,
      `#!/usr/bin/env sh\necho $$ > ${JSON.stringify(marker)}\ntrap '' TERM\nwhile true; do sleep 1; done\n`,
      { mode: 0o755 },
    );
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}:${previousPath ?? ""}`;
    const { inspectGitRepository } =
      await import("../dist/features/projects/projects.git.adapter.js");
    const controller = new AbortController();
    const promise = inspectGitRepository(repo, controller.signal);
    let pid = 0;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        pid = Number(await readFile(marker, "utf8"));
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    expect(pid).toBeGreaterThan(0);
    controller.abort();
    await expect(promise).rejects.toThrow();
    process.env.PATH = previousPath;
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      process.kill(pid, 0);
      throw new Error("fake git still alive");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ESRCH");
    }
  });
});
