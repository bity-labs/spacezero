import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts/prepare-github-app-config.mjs");

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-github-app-config-"));
  mkdirSync(join(dir, "resources"), { recursive: true });
  return dir;
}

function run(cwd, env) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd,
    env: {
      PATH: process.env.PATH,
      SPACEZERO_GITHUB_CLIENT_ID: "",
      SPACEZERO_GITHUB_APP_SLUG: "",
      ...env,
    },
    encoding: "utf8",
  });
}

test("writes packaged public GitHub App config from environment variables", () => {
  const cwd = makeRepo();
  const clientId = "Iv1.publicdummyclientid";
  const appSlug = "space-zero-dev";
  const result = run(cwd, {
    SPACEZERO_GITHUB_CLIENT_ID: clientId,
    SPACEZERO_GITHUB_APP_SLUG: appSlug,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(clientId), false);
  assert.equal(result.stdout.includes(appSlug), false);
  const config = JSON.parse(
    readFileSync(join(cwd, "resources/github-app.json"), "utf8"),
  );
  assert.deepEqual(config, { clientId, appSlug });
});

test("fails closed when public GitHub App variables are missing", () => {
  const cwd = makeRepo();
  const result = run(cwd, {});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SPACEZERO_GITHUB_CLIENT_ID is required/);
  assert.match(result.stderr, /SPACEZERO_GITHUB_APP_SLUG is required/);
  assert.equal(existsSync(join(cwd, "resources/github-app.json")), false);
});

test("rejects malformed public identifiers without echoing their values", () => {
  const cwd = makeRepo();
  const clientId = "Iv1.invalid client";
  const appSlug = "Space Zero";
  const result = run(cwd, {
    SPACEZERO_GITHUB_CLIENT_ID: clientId,
    SPACEZERO_GITHUB_APP_SLUG: appSlug,
  });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /SPACEZERO_GITHUB_CLIENT_ID must be a non-empty public identifier without whitespace/,
  );
  assert.match(
    result.stderr,
    /SPACEZERO_GITHUB_APP_SLUG must be a lowercase GitHub App slug/,
  );
  assert.equal(result.stderr.includes(clientId), false);
  assert.equal(result.stderr.includes(appSlug), false);
});
