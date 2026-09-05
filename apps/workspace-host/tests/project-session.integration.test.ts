import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  startHostServer,
  type StartedHostServer,
} from "../dist/runtime/host-server.js";
import { seedAgentRuntimeDefaults } from "./agent-runtime-defaults.helpers.js";

const origin = "spacezero://renderer";
const temps: string[] = [];
let hosts: StartedHostServer[] = [];

const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-project-session-"));
  temps.push(dir);
  return dir;
};
const run = (cmd: string, args: readonly string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    execFile(cmd, args, { cwd, shell: false }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
const gitCommit = async (repo: string, filename: string, content: string) => {
  await writeFile(join(repo, filename), content);
  await run("git", ["add", filename], repo);
  await run("git", ["commit", "-q", "-m", filename], repo);
};
const gitRepo = async (root: string) => {
  const repo = join(root, "repo");
  await mkdir(repo);
  await run("git", ["init", "-q"], repo);
  await run("git", ["config", "user.email", "agent@example.invalid"], repo);
  await run("git", ["config", "user.name", "Agent"], repo);
  await gitCommit(repo, "README.md", "hello\n");
  return repo;
};
const start = async (databasePath: string, spaceZeroHome: string) => {
  const host = await startHostServer({
    allowedRendererOrigin: origin,
    bootstrap: { consume: () => undefined },
    databasePath,
    spaceZeroHome,
  });
  seedAgentRuntimeDefaults(databasePath);
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
const registerProject = async (
  host: StartedHostServer,
  clientCapability: string,
  path: string,
) => {
  const response = await fetch(new URL("/v1/projects", host.endpoint), {
    method: "POST",
    headers: authHeaders(clientCapability),
    body: JSON.stringify({ commandId: randomUUID(), path }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { project: { id: string } };
};
const createSession = async (
  host: StartedHostServer,
  clientCapability: string,
  projectId: string,
  commandId = randomUUID(),
) => {
  const response = await fetch(new URL("/v1/project-sessions", host.endpoint), {
    method: "POST",
    headers: authHeaders(clientCapability),
    body: JSON.stringify({ commandId, projectId }),
  });
  return { response, body: (await response.json()) as unknown };
};
const listSessions = async (
  host: StartedHostServer,
  clientCapability: string,
) => {
  const response = await fetch(new URL("/v1/project-sessions", host.endpoint), {
    headers: authHeaders(clientCapability),
  });
  return { response, body: (await response.json()) as { sessions: unknown[] } };
};

afterEach(async () => {
  await Promise.all(hosts.map((host) => host.stop().catch(() => undefined)));
  hosts = [];
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("Project Session Host protocol", () => {
  it("creates and lists a managed worktree Session from a registered Project", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    await writeFile(join(repo, "dirty.txt"), "excluded\n");
    const sourceCommit = await run("git", ["rev-parse", "HEAD"], repo);
    const sourceBranch = await run("git", ["branch", "--show-current"], repo);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);

    const created = await createSession(
      host,
      client.clientCapability,
      project.project.id,
    );
    const body = created.body as {
      session: {
        id: string;
        name: string;
        managedBranch: string;
        sourceCommit: string;
        sourceBranch: string;
        uncommittedChangesExcluded: boolean;
        state: string;
      };
    };

    expect(created.response.status).toBe(200);
    expect(body.session.state).toBe("ready");
    expect(body.session.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(body.session.managedBranch).toBe(
      `spacezero/${body.session.name}-${body.session.id}`,
    );
    expect(body.session.sourceCommit).toBe(sourceCommit);
    expect(body.session.sourceBranch).toBe(sourceBranch);
    expect(body.session.uncommittedChangesExcluded).toBe(true);
    const worktreePath = join(
      root,
      "SpaceZero",
      "worktrees",
      project.project.id,
      body.session.id,
    );
    await expect(
      readFile(join(worktreePath, "README.md"), "utf8"),
    ).resolves.toBe("hello\n");
    await expect(
      readFile(join(worktreePath, "dirty.txt"), "utf8"),
    ).rejects.toThrow();
    expect(await run("git", ["branch", "--show-current"], worktreePath)).toBe(
      body.session.managedBranch,
    );
    const listed = await listSessions(host, client.clientCapability);
    expect(listed.response.status).toBe(200);
    expect(listed.body.sessions).toHaveLength(1);
  });

  it("replays duplicate Session commands without creating another name", async () => {
    const root = await temp();
    const repo = await gitRepo(root);
    const host = await start(
      join(root, "host.sqlite"),
      join(root, "SpaceZero"),
    );
    const client = descriptor(host);
    const project = await registerProject(host, client.clientCapability, repo);
    const commandId = randomUUID();

    const first = await createSession(
      host,
      client.clientCapability,
      project.project.id,
      commandId,
    );
    const second = await createSession(
      host,
      client.clientCapability,
      project.project.id,
      commandId,
    );

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(second.body).toMatchObject(first.body as object);
  });
});
