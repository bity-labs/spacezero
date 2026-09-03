import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(
  process.cwd(),
  "scripts/verify-macos-release-artifacts.mjs",
);
const version = "0.1.0-beta.1";

function sha512Base64(value) {
  return createHash("sha512").update(value).digest("base64");
}

function metadataFor(base, zipContents) {
  const digest = sha512Base64(zipContents);
  return `version: ${version}\nfiles:\n  - url: ${base}.zip\n    sha512: ${digest}\n    size: ${zipContents.length}\npath: ${base}.zip\nsha512: ${digest}\nreleaseDate: '2026-01-01T00:00:00.000Z'\n`;
}

function makeArtifacts({
  arch = "arm64",
  metadata = undefined,
  omit = [],
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-macos-artifacts-"));
  const base = `Space-Zero-${version}-${arch}`;
  const zipContents = `fake ${base}.zip`;
  const contentsByName = {
    [`${base}.dmg`]: `fake ${base}.dmg`,
    [`${base}.zip`]: zipContents,
    [`${base}.zip.blockmap`]: `fake ${base}.zip.blockmap`,
  };
  for (const [name, contents] of Object.entries(contentsByName)) {
    if (!omit.includes(name)) writeFileSync(join(dir, name), contents);
  }
  writeFileSync(
    join(dir, "beta-mac.yml"),
    metadata ?? metadataFor(base, zipContents),
  );
  return dir;
}

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
  });
}

test("accepts a complete macOS artifact set for one architecture", () => {
  const dir = makeArtifacts({ arch: "arm64" });
  const result = run(["--dir", dir, "--version", version, "--arch", "arm64"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified macOS release artifacts/);
});

test("rejects missing expected artifacts", () => {
  const missing = `Space-Zero-${version}-arm64.zip.blockmap`;
  const dir = makeArtifacts({ arch: "arm64", omit: [missing] });
  const result = run(["--dir", dir, "--version", version, "--arch", "arm64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing artifact/);
  assert.match(result.stderr, /zip\.blockmap/);
});

test("rejects updater metadata that points at a local absolute path", () => {
  const dir = makeArtifacts({
    metadata: `version: ${version}\nfiles:\n  - url: /tmp/Space-Zero-${version}-arm64.zip\n    sha512: fake\n    size: 10\npath: /tmp/Space-Zero-${version}-arm64.zip\nsha512: fake\n`,
  });
  const result = run(["--dir", dir, "--version", version, "--arch", "arm64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must reference release asset filenames/);
});

test("rejects updater metadata that does not reference the architecture zip", () => {
  const x64Zip = `fake Space-Zero-${version}-x64.zip`;
  const dir = makeArtifacts({
    metadata: `version: ${version}\nfiles:\n  - url: Space-Zero-${version}-x64.zip\n    sha512: ${sha512Base64(x64Zip)}\n    size: ${x64Zip.length}\npath: Space-Zero-${version}-x64.zip\nsha512: ${sha512Base64(x64Zip)}\n`,
  });
  writeFileSync(join(dir, `Space-Zero-${version}-x64.zip`), x64Zip);
  const result = run(["--dir", dir, "--version", version, "--arch", "arm64"]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /does not reference Space-Zero-0\.1\.0-beta\.1-arm64\.zip/,
  );
});

test("rejects updater metadata whose sha512 does not match the zip", () => {
  const base = `Space-Zero-${version}-arm64`;
  const zipContents = `fake ${base}.zip`;
  const dir = makeArtifacts({
    metadata: `version: ${version}\nfiles:\n  - url: ${base}.zip\n    sha512: fake\n    size: ${zipContents.length}\npath: ${base}.zip\nsha512: fake\n`,
  });
  const result = run(["--dir", dir, "--version", version, "--arch", "arm64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sha512 does not match beta-mac\.yml/);
});

test("rejects updater metadata whose size does not match the zip", () => {
  const base = `Space-Zero-${version}-arm64`;
  const dir = makeArtifacts({
    metadata: `version: ${version}\nfiles:\n  - url: ${base}.zip\n    sha512: ${sha512Base64(`fake ${base}.zip`)}\n    size: 1\npath: ${base}.zip\nsha512: ${sha512Base64(`fake ${base}.zip`)}\n`,
  });
  const result = run(["--dir", dir, "--version", version, "--arch", "arm64"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /size does not match beta-mac\.yml/);
});
