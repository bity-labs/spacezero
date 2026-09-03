import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts/validate-release-tag.mjs");

function makeRepo({
  rootVersion = "0.1.0-beta.1",
  desktopVersion = rootVersion,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-release-tag-"));
  mkdirSync(join(dir, "apps/desktop"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "spacezero", version: rootVersion, private: true }),
  );
  writeFileSync(
    join(dir, "apps/desktop/package.json"),
    JSON.stringify({ name: "@spacezero/desktop", version: desktopVersion }),
  );
  return dir;
}

function run(cwd, args = [], env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("accepts a beta tag that exactly matches root and Desktop package versions", () => {
  const result = run(makeRepo(), ["v0.1.0-beta.1"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated beta release tag v0\.1\.0-beta\.1/);
});

test("uses GITHUB_REF_NAME when no tag argument is provided", () => {
  const result = run(makeRepo(), [], { GITHUB_REF_NAME: "v0.1.0-beta.2" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match package version 0\.1\.0-beta\.1/);
});

test("rejects a missing tag", () => {
  const result = run(makeRepo(), [], { GITHUB_REF_NAME: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /release tag is required/);
});

test("rejects non-beta tags before packaging", () => {
  const result = run(makeRepo({ rootVersion: "0.1.0" }), ["v0.1.0"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be shaped like v<version>-beta\.<number>/);
});

test("rejects beta tags that do not match package.json", () => {
  const result = run(makeRepo(), ["v0.1.0-beta.2"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match package version 0\.1\.0-beta\.1/);
});

test("rejects mismatched root and Desktop package versions", () => {
  const result = run(
    makeRepo({ rootVersion: "0.1.0-beta.1", desktopVersion: "0.1.0-beta.2" }),
    ["v0.1.0-beta.1"],
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /root package version 0\.1\.0-beta\.1 must match Desktop package version 0\.1\.0-beta\.2/,
  );
});
