import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(
  process.cwd(),
  "scripts/merge-macos-update-metadata.mjs",
);
const version = "0.1.0-beta.1";

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-merge-mac-"));
  mkdirSync(dir, { recursive: true });
  for (const arch of ["x64", "arm64"]) {
    const zip = `Space-Zero-${version}-${arch}.zip`;
    writeFileSync(join(dir, zip), `${arch} zip`);
    writeFileSync(
      join(dir, `beta-mac-${arch}.yml`),
      `version: ${version}\nfiles:\n  - url: ${zip}\n    sha512: ${arch}-sha512\n    size: 10\npath: ${zip}\nsha512: ${arch}-sha512\nreleaseDate: '2026-01-01T00:00:00.000Z'\n`,
    );
  }
  return dir;
}

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
  });
}

test("merges per-architecture updater manifests into beta-mac.yml", () => {
  const dir = makeDir();
  const result = run(["--dir", dir, "--version", version]);
  assert.equal(result.status, 0, result.stderr);
  const merged = readFileSync(join(dir, "beta-mac.yml"), "utf8");
  assert.match(merged, new RegExp(`version: ${version}`));
  assert.match(merged, /url: Space-Zero-0\.1\.0-beta\.1-x64\.zip/);
  assert.match(merged, /url: Space-Zero-0\.1\.0-beta\.1-arm64\.zip/);
  assert.match(merged, /path: Space-Zero-0\.1\.0-beta\.1-x64\.zip/);
});

test("fails when an architecture manifest is missing", () => {
  const dir = makeDir();
  const result = run(["--dir", dir, "--version", version, "--arch", "arm64"]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /At least two architecture manifests are required/,
  );
});

test("rejects manifests for the wrong version", () => {
  const dir = makeDir();
  writeFileSync(
    join(dir, "beta-mac-arm64.yml"),
    `version: 0.1.0-beta.2\nfiles:\n  - url: Space-Zero-0.1.0-beta.2-arm64.zip\n    sha512: arm64-sha512\n    size: 10\npath: Space-Zero-0.1.0-beta.2-arm64.zip\nsha512: arm64-sha512\n`,
  );
  const result = run(["--dir", dir, "--version", version]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match 0\.1\.0-beta\.1/);
});
