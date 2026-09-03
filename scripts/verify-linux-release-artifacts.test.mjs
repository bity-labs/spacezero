import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(
  process.cwd(),
  "scripts/verify-linux-release-artifacts.mjs",
);
const version = "0.1.0-beta.1";

function sha512Base64(value) {
  return createHash("sha512").update(value).digest("base64");
}

function metadataFor(base, appImageContents) {
  const digest = sha512Base64(appImageContents);
  return `version: ${version}\nfiles:\n  - url: ${base}.AppImage\n    sha512: ${digest}\n    size: ${appImageContents.length}\npath: ${base}.AppImage\nsha512: ${digest}\nreleaseDate: '2026-01-01T00:00:00.000Z'\n`;
}

function makeArtifacts({ metadata = undefined, omit = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-linux-artifacts-"));
  const base = `Space-Zero-${version}-x86_64`;
  const appImageContents = `fake ${base}.AppImage`;
  if (!omit.includes(`${base}.AppImage`)) {
    writeFileSync(join(dir, `${base}.AppImage`), appImageContents, {
      mode: 0o755,
    });
  }
  writeFileSync(
    join(dir, "beta-linux.yml"),
    metadata ?? metadataFor(base, appImageContents),
  );
  return dir;
}

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
  });
}

test("accepts a complete Linux AppImage artifact set", () => {
  const dir = makeArtifacts();
  const result = run(["--dir", dir, "--version", version, "--arch", "x64"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified Linux release artifacts/);
});

test("rejects missing AppImage artifacts", () => {
  const dir = makeArtifacts({
    omit: [`Space-Zero-${version}-x86_64.AppImage`],
  });
  const result = run(["--dir", dir, "--version", version, "--arch", "x64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing artifact/);
  assert.match(result.stderr, /AppImage/);
});

test("rejects updater metadata that points at an absolute path", () => {
  const base = `Space-Zero-${version}-x86_64`;
  const contents = `fake ${base}.AppImage`;
  const dir = makeArtifacts({
    metadata: `version: ${version}\nfiles:\n  - url: /tmp/${base}.AppImage\n    sha512: ${sha512Base64(contents)}\n    size: ${contents.length}\npath: /tmp/${base}.AppImage\nsha512: ${sha512Base64(contents)}\n`,
  });
  const result = run(["--dir", dir, "--version", version, "--arch", "x64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must reference release asset filenames/);
});

test("rejects updater metadata whose sha512 does not match the AppImage", () => {
  const base = `Space-Zero-${version}-x86_64`;
  const dir = makeArtifacts({
    metadata: `version: ${version}\nfiles:\n  - url: ${base}.AppImage\n    sha512: fake\n    size: ${`fake ${base}.AppImage`.length}\npath: ${base}.AppImage\nsha512: fake\n`,
  });
  const result = run(["--dir", dir, "--version", version, "--arch", "x64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sha512 does not match beta-linux\.yml/);
});

test("rejects updater metadata whose size does not match the AppImage", () => {
  const base = `Space-Zero-${version}-x86_64`;
  const appImageContents = `fake ${base}.AppImage`;
  const dir = makeArtifacts({
    metadata: `version: ${version}\nfiles:\n  - url: ${base}.AppImage\n    sha512: ${sha512Base64(appImageContents)}\n    size: 1\npath: ${base}.AppImage\nsha512: ${sha512Base64(appImageContents)}\n`,
  });
  const result = run(["--dir", dir, "--version", version, "--arch", "x64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /size does not match beta-linux\.yml/);
});
