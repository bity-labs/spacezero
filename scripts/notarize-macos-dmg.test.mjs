import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts/notarize-macos-dmg.mjs");
const version = "0.1.0-beta.1";

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-dmg-notary-"));
  writeFileSync(join(dir, `Space Zero-${version}-arm64.dmg`), "fake dmg");
  return dir;
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    env: {
      PATH: process.env.PATH,
      APPLE_API_KEY: "",
      APPLE_API_KEY_ID: "",
      APPLE_API_ISSUER: "",
      ...env,
    },
    encoding: "utf8",
  });
}

test("fails closed before notarization when App Store Connect API-key env is missing", () => {
  const result = run([
    "--dir",
    makeDir(),
    "--version",
    version,
    "--arch",
    "arm64",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /APPLE_API_KEY is required/);
});

test("fails before invoking notarytool when the expected DMG is missing", () => {
  const secretPath = "/tmp/secret/AuthKey_TEST.p8";
  const result = run(
    ["--dir", makeDir(), "--version", version, "--arch", "x64"],
    {
      APPLE_API_KEY: secretPath,
      APPLE_API_KEY_ID: "KEYID12345",
      APPLE_API_ISSUER: "issuer-id",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing DMG artifact/);
  assert.equal(result.stderr.includes(secretPath), false);
});
